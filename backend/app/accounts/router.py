import re
import secrets
from datetime import timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import clock
from app.accounts import coins
from app.accounts.deps import current_child, current_parent, current_teacher
from app.accounts.models import (
    Child,
    ClassMembership,
    Classroom,
    CodeAttempt,
    Parent,
    ParentNotification,
    QrToken,
    Teacher,
)
from app.accounts.nickcheck import NICK_RE, nick_allowed, text_allowed
from app.accounts.security import (
    COOKIE,
    hash_secret,
    make_session,
    picture_secret,
    read_session,
    sha256,
    verify_secret,
)
from app.config import get_settings
from app.db import get_session

router = APIRouter(prefix="/api")

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # без O/0/I/1
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
Pictures = Annotated[list[Annotated[int, Field(ge=0, le=11)]], Field(min_length=3, max_length=3)]
Db = Annotated[Session, Depends(get_session)]


def _set_cookie(resp: Response, role: str, uid: int) -> None:
    s = get_settings()
    resp.set_cookie(
        COOKIE,
        make_session(role, uid),
        max_age=s.SESSION_DAYS * 86400,
        httponly=True,
        samesite="lax",
        secure=s.COOKIE_SECURE,
        path="/",
    )


# ---------- родитель и учитель: почта + пароль ----------


class Credentials(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=128)


def _register(model, role: str, body: Credentials, resp: Response, db: Session) -> dict:
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "bad_email")
    user = model(email=email, pw_hash=hash_secret(body.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "email_taken") from None
    _set_cookie(resp, role, user.id)
    return {"id": user.id, "email": user.email}


def _login(model, role: str, body: Credentials, resp: Response, db: Session) -> dict:
    user = db.scalar(select(model).where(model.email == body.email.strip().lower()))
    if not verify_secret(body.password, user.pw_hash if user else None):
        raise HTTPException(401, "bad_credentials")
    _set_cookie(resp, role, user.id)
    return {"id": user.id, "email": user.email}


@router.post("/parent/register", status_code=201)
def parent_register(body: Credentials, resp: Response, db: Db):
    return _register(Parent, "parent", body, resp, db)


@router.post("/parent/login")
def parent_login(body: Credentials, resp: Response, db: Db):
    return _login(Parent, "parent", body, resp, db)


@router.post("/teacher/register", status_code=201)
def teacher_register(body: Credentials, resp: Response, db: Db):
    return _register(Teacher, "teacher", body, resp, db)


@router.post("/teacher/login")
def teacher_login(body: Credentials, resp: Response, db: Db):
    return _login(Teacher, "teacher", body, resp, db)


@router.post("/logout")
@router.post("/parent/logout")
@router.post("/teacher/logout")
@router.post("/child/logout")
def logout(resp: Response):
    resp.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/session")
def session_info(db: Db, studio_session: Annotated[str | None, Cookie(alias=COOKIE)] = None):
    """Кто вошёл. Без входа — 200 и role=None: фронту не нужны 401 в консоли на каждой загрузке."""
    s = read_session(studio_session)
    model = {"parent": Parent, "teacher": Teacher, "child": Child}.get(s[0]) if s else None
    if s and model and db.get(model, s[1]):
        return {"role": s[0]}
    return {"role": None}


@router.get("/parent/me")
def parent_me(p: Annotated[Parent, Depends(current_parent)]):
    return {"id": p.id, "email": p.email}


@router.get("/teacher/me")
def teacher_me(t: Annotated[Teacher, Depends(current_teacher)]):
    return {"id": t.id, "email": t.email}


# ---------- родитель: дети ----------


class NewChild(BaseModel):
    nick: str
    age_group: Literal["5-8", "9-12"]
    lang: Literal["ru", "en", "uz"]
    pictures: Pictures


@router.post("/parent/children", status_code=201)
def create_child(body: NewChild, p: Annotated[Parent, Depends(current_parent)], db: Db):
    nick = body.nick.strip()
    if not NICK_RE.match(nick):
        raise HTTPException(422, "nick_format")
    norm = nick.lower()
    if db.scalar(select(Child.id).where(Child.nick_norm == norm)):
        raise HTTPException(409, "nick_taken")
    # Проверка последним шагом: до неё ничего не сохранено, после — ник сохраняется только при allow.
    if not nick_allowed(nick, body.lang):
        raise HTTPException(422, "nick_rejected")
    child = Child(
        nick=nick,
        nick_norm=norm,
        age_group=body.age_group,
        lang=body.lang,
        parent_id=p.id,
        picture_password_hash=hash_secret(picture_secret(body.pictures)),
    )
    db.add(child)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "nick_taken") from None
    coins.add_entry(db, child.id, get_settings().COIN_START, "start", f"start:{child.id}")
    db.commit()
    return {"id": child.id, "nick": child.nick}


def _own_child(db: Session, p: Parent, child_id: int) -> Child:
    c = db.get(Child, child_id)
    if c is None or c.parent_id != p.id:
        raise HTTPException(404, "not_found")
    return c


@router.get("/parent/children")
def list_children(p: Annotated[Parent, Depends(current_parent)], db: Db):
    now = clock.now()
    rows = db.scalars(select(Child).where(Child.parent_id == p.id).order_by(Child.id)).all()
    return [
        {
            "id": c.id,
            "nick": c.nick,
            "age_group": c.age_group,
            "lang": c.lang,
            "coins": coins.balance(db, c.id),
            "locked": bool(c.locked_until and c.locked_until > now),
        }
        for c in rows
    ]


@router.get("/parent/notifications")
def list_notifications(p: Annotated[Parent, Depends(current_parent)], db: Db):
    q = (
        select(ParentNotification, Child.nick)
        .join(Child, Child.id == ParentNotification.child_id)
        .where(ParentNotification.parent_id == p.id)
        .order_by(ParentNotification.id.desc())
        .limit(50)
    )
    return [
        {"id": n.id, "kind": n.kind, "nick": nick, "created_at": n.created_at.isoformat(), "read": n.read}
        for n, nick in db.execute(q)
    ]


@router.post("/parent/notifications/read")
def read_notifications(p: Annotated[Parent, Depends(current_parent)], db: Db):
    for n in db.scalars(
        select(ParentNotification).where(
            ParentNotification.parent_id == p.id, ParentNotification.read.is_(False)
        )
    ):
        n.read = True
    db.commit()
    return {"ok": True}


# ---------- QR-вход ----------


def _new_qr(db: Session, child: Child) -> dict:
    token = secrets.token_urlsafe(24)
    ttl = get_settings().QR_TTL_MINUTES
    expires = clock.now() + timedelta(minutes=ttl)
    db.add(QrToken(token_hash=sha256(token), child_id=child.id, expires_at=expires))
    db.commit()
    return {"token": token, "expires_in": ttl * 60}


@router.post("/parent/children/{child_id}/qr")
def parent_qr(child_id: int, p: Annotated[Parent, Depends(current_parent)], db: Db):
    return _new_qr(db, _own_child(db, p, child_id))


@router.post("/teacher/classes/{class_id}/children/{child_id}/qr")
def teacher_qr(class_id: int, child_id: int, t: Annotated[Teacher, Depends(current_teacher)], db: Db):
    room = _own_class(db, t, class_id)
    member = db.scalar(
        select(ClassMembership.id).where(
            ClassMembership.class_id == room.id, ClassMembership.child_id == child_id
        )
    )
    child = db.get(Child, child_id)
    if not member or child is None:
        raise HTTPException(404, "not_found")
    return _new_qr(db, child)


class QrLogin(BaseModel):
    token: str = Field(min_length=8, max_length=200)


@router.post("/child/qr-login")
def qr_login(body: QrLogin, resp: Response, db: Db):
    # POST: токен не попадает в access-лог. Одно использование — условным UPDATE,
    # иначе параллельные запросы с одним токеном проходят все.
    h, now = sha256(body.token), clock.now()
    child_id = db.scalar(select(QrToken.child_id).where(QrToken.token_hash == h))
    used = db.execute(
        update(QrToken)
        .where(QrToken.token_hash == h, QrToken.used_at.is_(None), QrToken.expires_at > now)
        .values(used_at=now)
    )
    if child_id is None or used.rowcount != 1:
        db.rollback()
        raise HTTPException(401, "bad_token")
    child = db.get(Child, child_id)
    child.failed_attempts = 0
    child.locked_until = None  # QR — путь «забыл»: взрослый сам снял замок
    db.commit()
    _set_cookie(resp, "child", child.id)
    return {"ok": True}


# ---------- учитель: классы ----------


class NewClass(BaseModel):
    name: str = Field(min_length=1, max_length=60)


def _own_class(db: Session, t: Teacher, class_id: int) -> Classroom:
    room = db.get(Classroom, class_id)
    if room is None or room.teacher_id != t.id:
        raise HTTPException(404, "not_found")
    return room


@router.post("/teacher/classes", status_code=201)
def create_class(body: NewClass, t: Annotated[Teacher, Depends(current_teacher)], db: Db):
    # Название класса видит ребёнок — та же проверка, что у ника; сбой — не сохраняем.
    if not text_allowed(body.name.strip(), "caption", "ru"):  # у учителя нет языка профиля
        raise HTTPException(422, "name_rejected")
    for _ in range(20):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        room = Classroom(teacher_id=t.id, name=body.name.strip(), code=code)
        db.add(room)
        try:
            db.commit()
            return {"id": room.id, "name": room.name, "code": room.code}
        except IntegrityError:
            db.rollback()
    raise HTTPException(500, "code_generation_failed")


@router.get("/teacher/classes")
def list_classes(t: Annotated[Teacher, Depends(current_teacher)], db: Db):
    rows = db.scalars(select(Classroom).where(Classroom.teacher_id == t.id).order_by(Classroom.id))
    return [{"id": r.id, "name": r.name, "code": r.code} for r in rows]


@router.get("/teacher/classes/{class_id}/children")
def class_children(class_id: int, t: Annotated[Teacher, Depends(current_teacher)], db: Db):
    room = _own_class(db, t, class_id)
    q = (
        select(Child)
        .join(ClassMembership, ClassMembership.child_id == Child.id)
        .where(ClassMembership.class_id == room.id)
        .order_by(Child.nick)
    )
    return [{"id": c.id, "nick": c.nick, "age_group": c.age_group} for c in db.scalars(q)]


# ---------- ребёнок ----------


class ChildLogin(BaseModel):
    nick: str = Field(max_length=40)
    pictures: Pictures


@router.post("/child/login")
def child_login(body: ChildLogin, resp: Response, db: Db):
    s = get_settings()
    now = clock.now()
    child = db.scalar(select(Child).where(Child.nick_norm == body.nick.strip().lower()))
    stored = child.picture_password_hash if child else None
    ok = verify_secret(picture_secret(body.pictures), stored)
    # Один и тот же ответ на «нет ника», «неверно» и «закрыто»: ник не выдаём.
    if child is None:
        raise HTTPException(401, "bad_credentials")
    # Счётчик и замок меняются только условным UPDATE по незапертой строке: параллельная
    # пачка попыток не обходит лимит (SQLite сериализует запись), запертый ник не входит.
    unlocked = or_(Child.locked_until.is_(None), Child.locked_until <= now)
    if not ok:
        n = db.scalar(
            update(Child)
            .where(Child.id == child.id, unlocked)
            .values(failed_attempts=Child.failed_attempts + 1)
            .returning(Child.failed_attempts)
        )
        if n is not None and n >= s.LOGIN_FAILS_MAX:
            db.execute(
                update(Child)
                .where(Child.id == child.id)
                .values(locked_until=now + timedelta(minutes=s.LOGIN_LOCK_MINUTES), failed_attempts=0)
            )
            if child.parent_id:
                db.add(
                    ParentNotification(parent_id=child.parent_id, child_id=child.id, kind="login_locked")
                )
        db.commit()
        raise HTTPException(401, "bad_credentials")
    passed = db.execute(
        update(Child).where(Child.id == child.id, unlocked).values(failed_attempts=0, locked_until=None)
    )
    if passed.rowcount != 1:
        db.rollback()
        raise HTTPException(401, "bad_credentials")
    db.commit()
    _set_cookie(resp, "child", child.id)
    return {"ok": True}


class JoinClass(BaseModel):
    code: str = Field(min_length=1, max_length=12)


@router.post("/child/join-class")
def join_class(body: JoinClass, c: Annotated[Child, Depends(current_child)], db: Db):
    s = get_settings()
    now = clock.now()
    since = now - timedelta(minutes=s.CODE_FAILS_WINDOW_MINUTES)
    fails = db.scalar(
        select(func.count())
        .select_from(CodeAttempt)
        .where(CodeAttempt.child_id == c.id, CodeAttempt.at > since)
    )
    if (fails or 0) >= s.CODE_FAILS_MAX:
        raise HTTPException(429, "too_many_attempts")
    room = db.scalar(select(Classroom).where(Classroom.code == body.code.strip().upper()))
    if room is None:
        db.add(CodeAttempt(child_id=c.id, at=now))
        db.commit()
        raise HTTPException(404, "bad_code")
    if db.scalar(select(ClassMembership.id).where(ClassMembership.child_id == c.id)):
        raise HTTPException(409, "already_in_class")
    db.add(ClassMembership(child_id=c.id, class_id=room.id))
    db.commit()
    return {"class": {"id": room.id, "name": room.name}}


@router.get("/child/me")
def child_me(c: Annotated[Child, Depends(current_child)], db: Db):
    coins.grant_daily(db, c.id)
    room = db.scalar(
        select(Classroom)
        .join(ClassMembership, ClassMembership.class_id == Classroom.id)
        .where(ClassMembership.child_id == c.id)
    )
    return {
        "id": c.id,
        "nick": c.nick,
        "lang": c.lang,
        "age_group": c.age_group,
        "coins": coins.balance(db, c.id),
        "class": {"id": room.id, "name": room.name} if room else None,
        "has_parent": c.parent_id is not None,
    }
