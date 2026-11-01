from typing import Annotated

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session

from app.accounts.models import Child, Parent, Teacher
from app.accounts.security import COOKIE, read_session
from app.db import get_session

Db = Annotated[Session, Depends(get_session)]
Session_ = Annotated[str | None, Cookie(alias=COOKIE)]


def _load(model, role: str, token: str | None, db: Session):
    s = read_session(token)
    obj = db.get(model, s[1]) if s and s[0] == role else None
    if obj is None:
        raise HTTPException(401, "unauthorized")
    return obj


def current_parent(db: Db, studio_session: Session_ = None) -> Parent:
    return _load(Parent, "parent", studio_session, db)


def current_teacher(db: Db, studio_session: Session_ = None) -> Teacher:
    return _load(Teacher, "teacher", studio_session, db)


def current_child(db: Db, studio_session: Session_ = None) -> Child:
    return _load(Child, "child", studio_session, db)
