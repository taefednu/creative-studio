"""Вход для жюри в один клик: только на демо-стенде с синтетическими данными (DEMO_LOGIN=true)."""

import threading
from pathlib import Path
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import db as dbmod
from app.accounts import coins
from app.accounts.models import Child, Parent, Teacher
from app.accounts.router import _set_cookie
from app.config import get_settings
from app.db import get_session
from app.works.image.models import Work
from app.works.image.thumbs import _thumb

router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_session)]
TOPUP = 20  # общий демо-ребёнок: монеты не должны кончиться посреди показ
# Два разных ребёнка, как в жизни: школьник с классом и учителем без родителя, домашний с родителем без класса
DEMO_KIDS = {"school": "SkyFox", "family": "Bunny"}


class DemoLogin(BaseModel):
    role: Literal["school", "family", "parent", "teacher"]


@router.get("/demo")
def demo_enabled() -> dict:
    return {"enabled": get_settings().DEMO_LOGIN}


@router.post("/demo/login")
def demo_login(body: DemoLogin, resp: Response, db: Db) -> dict:
    # Выключено: как будто ручки нет. На настоящем стенде это обход пароля
    if not get_settings().DEMO_LOGIN:
        raise HTTPException(404, "not_found")
    user: Child | Parent | Teacher | None
    if body.role in DEMO_KIDS:
        user = db.scalar(select(Child).where(Child.nick == DEMO_KIDS[body.role]))
        if user is not None and coins.balance(db, user.id) < TOPUP:
            coins.add_entry(db, user.id, TOPUP, "demo_topup", f"demo-{uuid4().hex}")
            db.commit()
    elif body.role == "parent":
        user = db.scalar(select(Parent).where(Parent.email == "parent@example.com"))
    else:
        user = db.scalar(select(Teacher).where(Teacher.email == "aziza@example.com"))
    if user is None:
        raise HTTPException(404, "not_found")
    role = "child" if body.role in DEMO_KIDS else body.role
    _set_cookie(resp, role, user.id)
    return {"ok": True, "role": role}


def warm_thumbs() -> None:
    """Превью всех работ заранее: первый гость не ждёт, пока сервер их нарежет."""

    def run() -> None:
        s = dbmod.new_session()
        try:
            paths = s.scalars(select(Work.file_path).where(Work.status == "ready").limit(500)).all()
        finally:
            s.close()
        for p in paths:
            if p and Path(p).is_file():
                _thumb(p, Path(p).stat().st_mtime_ns)

    threading.Thread(target=run, daemon=True).start()
