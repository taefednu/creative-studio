"""«Войти через Mentorium» (#5): логин и пароль платформы -> локальный аккаунт -> cookie студии.

Локально хранится только platform_user_id и роль. Имя, почта, пароль и токен платформы — нет.
Ребёнку при первом входе даём выдуманный ник из конфига: имя на платформе может быть личным.
"""

import json
import logging
import random
import time
from collections import defaultdict, deque
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import clock
from app.accounts import coins
from app.accounts.models import Child, Parent, Teacher
from app.accounts.router import _set_cookie
from app.accounts.security import COOKIE, read_session, sha256
from app.config import get_settings
from app.db import get_session
from app.platform import client as pc
from app.works.image.models import Work
from app.works.story.models import IN_PROGRESS, Story

log = logging.getLogger("app.platform")
router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_session)]

ROLES = {"student": "child", "parent": "parent", "teacher": "teacher"}
MODELS = {"child": Child, "parent": Parent, "teacher": Teacher}
CAPTCHA_TEXT = {
    "ru": "Войди один раз на платформе Mentorium и возвращайся сюда.",
    "en": "Sign in once on the Mentorium platform, then come back here.",
    "uz": "Mentorium platformasiga bir marta kiring va shu yerga qayting.",
}
LANGS = ("ru", "en", "uz")
_hits: dict[str, deque] = defaultdict(deque)  # адрес клиента -> время запросов (monotonic)
_paused: dict[str, object] = {}  # sha256(логин) -> до какого времени не шлём на платформу


def _rate_limited(ip: str) -> bool:
    """Свой лимит студии на адрес клиента: скользящая минута, PLATFORM_LOGIN_PER_MINUTE."""
    now = time.monotonic()
    q = _hits[ip]
    while q and q[0] <= now - 60:
        q.popleft()
    if len(q) >= get_settings().PLATFORM_LOGIN_PER_MINUTE:
        return True
    q.append(now)
    return False


def _captcha_error() -> HTTPException:
    return HTTPException(429, {"code": "platform_captcha", "messages": CAPTCHA_TEXT})


def _pause_key(login: str) -> str:
    return sha256(login.strip().lower())


def _is_paused(key: str) -> bool:
    until = _paused.get(key)
    if until is None:
        return False
    if until <= clock.now():  # type: ignore[operator]
        _paused.pop(key, None)
        return False
    return True


def _new_nick(db: Session) -> tuple[str, str]:
    s = get_settings()
    for _ in range(50):
        nick = f"{random.choice(s.NICK_ADJECTIVES)}{random.choice(s.NICK_ANIMALS)}{random.randint(10, 999)}"
        if len(nick) <= 20 and not db.scalar(select(Child.id).where(Child.nick_norm == nick.lower())):
            return nick, nick.lower()
    raise HTTPException(500, "nick_generation_failed")


def _account(db: Session, role: str, uid: str):
    model = MODELS[role]
    return db.scalar(select(model).where(model.platform_user_id == uid))


def _create(db: Session, role: str, uid: str, lang: str = "ru"):
    if role == "child":
        nick, norm = _new_nick(db)
        # Возраст платформа не отдаёт (9-12 по умолчанию). Язык: из тела входа при первом создании
        # (ru, en, uz), дальше его меняет POST /api/child/lang.
        return Child(nick=nick, nick_norm=norm, age_group="9-12", lang=lang, platform_user_id=uid)
    return (Parent if role == "parent" else Teacher)(platform_user_id=uid)


async def _credentials(request: Request) -> tuple[str, str, str]:
    # Тело разбираем сами: стандартный ответ 422 повторяет введённое, а там пароль.
    try:
        body = json.loads(await request.body())
        login, password = body["login"], body["password"]
        lang = body.get("lang", "ru")
        if not (isinstance(login, str) and isinstance(password, str) and login.strip() and password):
            raise ValueError
        if lang not in LANGS:
            raise ValueError
    except (ValueError, KeyError, TypeError):
        raise HTTPException(422, "bad_request") from None
    ip = request.client.host if request.client else "?"
    if _rate_limited(ip):
        raise HTTPException(429, "platform_busy")
    return login.strip()[:255], password, lang


@router.post("/auth/platform-login")
async def platform_login(request: Request, resp: Response, db: Db):
    login, password, lang = await _credentials(request)
    # Сеть блокирующая: уводим из цикла событий.
    return await run_in_threadpool(_login, db, resp, login, password, lang)


def _session_account(db: Session, studio_session: str | None):
    s = read_session(studio_session)
    acc = db.get(MODELS[s[0]], s[1]) if s and s[0] in MODELS else None
    if acc is None:
        raise HTTPException(401, "unauthorized")
    return s[0], acc


def _can_link() -> bool:
    # На демо-стенде аккаунты общие: привязанный профиль и его монеты достались бы следующему посетителю
    s = get_settings()
    return bool(s.PLATFORM_API_URL) and not s.DEMO_LOGIN


@router.get("/auth/platform-link")
def platform_link_state(db: Db, studio_session: Annotated[str | None, Cookie(alias=COOKIE)] = None) -> dict:
    """enabled=false — платформа не настроена: кнопку не показываем, иначе она всегда даёт ошибку."""
    _, acc = _session_account(db, studio_session)
    return {"enabled": _can_link(), "linked": acc.platform_user_id is not None}


@router.post("/auth/platform-link")
async def platform_link(request: Request, db: Db, studio_session: Annotated[str | None, Cookie(alias=COOKIE)] = None):
    role, acc = _session_account(db, studio_session)  # до логина: без своей сессии на платформу не ходим
    if get_settings().DEMO_LOGIN:
        raise HTTPException(403, "platform_demo")
    login, password, _ = await _credentials(request)
    return await run_in_threadpool(_link, db, role, acc, login, password)


def _link(db: Session, role: str, acc, login: str, password: str) -> dict:
    """Профиль Mentorium к уже созданному аккаунту. Работы и журнал монет остаются на этом же аккаунте.

    Уже занятый профиль не сливаем: у двух аккаунтов разные работы, взрослые и класс, ошибка необратима.
    """
    user = _platform_user(login, password)
    if ROLES.get(user.role) != role:  # ребёнок с логином взрослого и наоборот
        raise HTTPException(403, "platform_wrong_role")
    if acc.platform_user_id == user.user_id:
        return {"ok": True}  # двойной клик
    if acc.platform_user_id:
        raise HTTPException(409, "platform_already_linked")
    if _account(db, role, user.user_id) is not None:
        raise HTTPException(409, "platform_taken")
    if role == "child" and _in_flight(db, acc.id):  # её возврат ушёл бы на платформу монетой, которой там не было
        raise HTTPException(409, "platform_busy_work")
    acc.platform_user_id = user.user_id
    if role == "child":
        acc.studio_coins = coins.balance(db, acc.id)
        # Как у ребёнка, созданного платформой: сессия теперь тратит её монеты, а картинка-пароль слабая
        acc.picture_password_hash = None
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "platform_taken") from None
    return {"ok": True}


def _in_flight(db: Session, child_id: int) -> bool:
    work = db.scalar(select(Work.id).where(Work.child_id == child_id, Work.status.in_(("checking", "generating"))).limit(1))
    story = db.scalar(select(Story.id).where(Story.child_id == child_id, Story.status.in_(IN_PROGRESS)).limit(1))
    return work is not None or story is not None


def _platform_user(login: str, password: str):
    try:
        client = pc.get_client()
    except pc.NotConfigured:
        raise HTTPException(503, "platform_not_configured") from None
    key = _pause_key(login)
    if _is_paused(key):  # после капчи/429 студия сама не перебирает
        raise _captcha_error()
    try:
        user = client.login(login, password)
    except pc.CaptchaRequired:
        pause = get_settings().PLATFORM_CAPTCHA_PAUSE_MINUTES
        _paused[key] = clock.now() + timedelta(minutes=pause)
        raise _captcha_error() from None
    except pc.Busy:  # лимит платформы на адрес студии: ждать, на платформе делать нечего
        raise HTTPException(429, "platform_busy") from None
    except pc.BadCredentials:
        raise HTTPException(401, "bad_credentials") from None
    except pc.PlatformError:
        raise HTTPException(503, "platform_unavailable") from None
    return user


def _login(db: Session, resp: Response, login: str, password: str, lang: str = "ru") -> dict:
    user = _platform_user(login, password)
    role = ROLES.get(user.role)
    if role is None:  # админ, куратор и всё неизвестное: не угадываем
        raise HTTPException(403, "unknown_role")
    acc = _account(db, role, user.user_id)
    if acc is None:
        acc = _create(db, role, user.user_id, lang)
        db.add(acc)
        try:
            db.commit()
        except IntegrityError:  # два входа одновременно
            db.rollback()
            acc = _account(db, role, user.user_id)
            if acc is None:
                raise HTTPException(500, "account_create_failed") from None
    _set_cookie(resp, role, acc.id)
    return {"ok": True, "role": role}
