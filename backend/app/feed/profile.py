"""Профиль ребёнка: новый ник и своя картинка на аватарке.

Ник: та же проверка, что при регистрации. Сбой проверки уходит взрослому, ребёнок ждёт его решения.
Картинка: только своя готовая работа и только после «да» взрослого: аватарку видит весь класс, а работа
в класс и так идёт через взрослого. Подходит только нарисованное по запросу (`avatar_allowed`): в загрузке,
герое и страницах сказки из неё может быть настоящий ребёнок, ремикс зависит от чужой работы.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.accounts import nickcheck
from app.accounts.adults import child_with_adult, has_adult
from app.accounts.deps import current_child
from app.accounts.models import Child, ClassMembership
from app.accounts.nickcheck import NICK_RE
from app.config import get_settings
from app.db import get_session
from app.demo import DEMO_KIDS
from app.feed.models import Post
from app.moderation import HeldItem, hold, register
from app.works.image.models import Work

router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_session)]
ChildDep = Annotated[Child, Depends(current_child)]


def _hold_for_adult(db: Session, c: Child, item_type: str, target_id: int, codes: list[str], text: str | None = None, urgent: bool = False) -> None:
    class_id = db.scalar(select(ClassMembership.class_id).where(ClassMembership.child_id == c.id))
    hold(
        db,
        item_type=item_type,
        target_id=target_id,
        child_id=c.id,
        reviewer="parent" if c.parent_id is not None else "teacher",
        reason_codes=codes,
        class_id=class_id if c.parent_id is None else None,
        preview_text=text,
        urgent=urgent,
    )


def avatar_allowed(db: Session, w: Work | None) -> bool:
    """Отказ взрослого сильнее всего: скрытая или отклонённая работа на аватарке не живёт."""
    if w is None or w.status != "ready" or not w.file_path or w.kind != "image" or w.remix_of_post_id is not None:
        return False
    return db.scalar(select(Post.id).where(Post.work_id == w.id, Post.status.in_(("rejected", "hidden"))).limit(1)) is None


def _pending(db: Session, c: Child, item_type: str) -> HeldItem | None:
    # Срочное не ждёт решения и ребёнку не показывается: новый ник оно не держит
    return db.scalar(
        select(HeldItem).where(
            HeldItem.child_id == c.id, HeldItem.item_type == item_type, HeldItem.status == "pending", HeldItem.urgent.is_(False)
        )
    )


class NickBody(BaseModel):
    nick: str


@router.post("/child/nick")
def change_nick(body: NickBody, c: ChildDep, db: Db) -> dict:
    # Демо-вход ищет общих детей по нику: смена у одного посетителя закрыла бы вход всем
    if get_settings().DEMO_LOGIN and c.nick in DEMO_KIDS.values():
        raise HTTPException(403, "nick_demo")
    nick = body.nick.strip()
    if not NICK_RE.match(nick):
        raise HTTPException(422, "nick_format")
    norm = nick.lower()
    if nick == c.nick:
        return {"status": "ok", "nick": c.nick}
    if norm != c.nick_norm and db.scalar(select(Child.id).where(Child.nick_norm == norm)):
        raise HTTPException(409, "nick_taken")
    if _pending(db, c, "nickname"):
        raise HTTPException(409, "nick_pending")
    try:
        d = nickcheck._check_text()(nick, "nickname", c.lang)
    except Exception:  # noqa: BLE001 — fail closed: как сбой модели
        d = None
    if d is not None and d.action == "allow" and not d.model_error:
        c.nick, c.nick_norm = nick, norm
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "nick_taken") from None
        return {"status": "ok", "nick": nick}
    if d is None or d.model_error:
        if not has_adult(db, c):  # взрослого нет: решить некому, ник остаётся прежним
            raise HTTPException(503, "nick_check_failed")
        _hold_for_adult(db, c, "nickname", c.id, ["check_failed"], nick)
        return {"status": "held", "nick": c.nick}
    if (d.urgent or d.action == "support") and has_adult(db, c):
        _hold_for_adult(db, c, "nickname", c.id, list(d.reason_codes), nick, urgent=True)
    raise HTTPException(422, "nick_rejected")


class AvatarWorkBody(BaseModel):
    work_id: int


@router.post("/child/avatar-work")
def ask_avatar_work(body: AvatarWorkBody, c: Annotated[Child, Depends(child_with_adult)], db: Db) -> dict:
    w = db.get(Work, body.work_id)
    if w is None or w.child_id != c.id or not avatar_allowed(db, w):
        raise HTTPException(404, "not_found")
    if _pending(db, c, "avatar"):
        raise HTTPException(409, "avatar_pending")
    _hold_for_adult(db, c, "avatar", w.id, ["avatar_review"])
    return {"status": "held"}


@router.get("/child/profile")
def profile(c: ChildDep, db: Db) -> dict:
    """Что ждёт взрослого и какие работы можно поставить на аватарку."""
    pending_nick = _pending(db, c, "nickname")
    pending_avatar = _pending(db, c, "avatar")
    works = [
        w
        for w in db.scalars(select(Work).where(Work.child_id == c.id).order_by(Work.id.desc()).limit(60))
        if avatar_allowed(db, w)
    ][:12]
    return {
        # Текст срочного не показываем: ребёнок уже получил отказ, в ожидании такой ник не висит
        "nick_pending": pending_nick.preview_text if pending_nick and not pending_nick.urgent else None,
        "avatar_pending": int(pending_avatar.target_id) if pending_avatar else None,
        "avatar_work_id": c.avatar_work_id,
        "works": [{"id": w.id, "image_url": f"/api/works/{w.id}/image?thumb=1"} for w in works],
    }


def _approve_nick(db: Session, item: HeldItem) -> None:
    c = db.get(Child, item.child_id)
    nick = item.preview_text or ""
    taken = db.scalar(select(Child.id).where(Child.nick_norm == nick.lower(), Child.id != item.child_id))
    if c is None or not NICK_RE.match(nick) or taken:
        item.status = "rejected"  # пока ждал взрослого, ник заняли: остаётся прежний, ребёнку приходит отказ
        return
    c.nick, c.nick_norm = nick, nick.lower()


def _approve_avatar(db: Session, item: HeldItem) -> None:
    c = db.get(Child, item.child_id)
    w = db.get(Work, int(item.target_id))
    if c is None or w is None or w.child_id != c.id or not avatar_allowed(db, w):
        item.status = "rejected"  # пока ждал взрослого, работу отклонили: ребёнку приходит отказ
        return
    c.avatar_work_id = w.id


def _nothing(db: Session, item: HeldItem) -> None:
    """Отказ: остаётся прежний ник или аватарка, менять нечего."""


register("nickname", _approve_nick, _nothing)
register("avatar", _approve_avatar, _nothing)
