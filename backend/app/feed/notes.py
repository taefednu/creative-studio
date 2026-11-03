"""Колокольчик ребёнка: события собираются из того, что уже записано, отдельной таблицы нет.

Только то, что касается самого ребёнка. Срочное сюда не попадает: тёплый ответ он уже получил, а
«взрослому сообщили о тебе» в списке новостей его напугает. Чужих ников и текстов нет.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import clock
from app.accounts.deps import current_child
from app.accounts.models import Child
from app.assignments.models import Assignment, Submission
from app.assignments.router import _cover_url
from app.db import get_session
from app.feed import service
from app.feed.models import Comment, NoteCleared, Post, Reaction
from app.moderation import HeldItem
from app.moderation.router import _work_of

router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_session)]
ChildDep = Annotated[Child, Depends(current_child)]

LIMIT = 20
DECISION_TYPES = ("post", "comment", "prompt", "image", "upload", "story", "share", "nickname", "avatar")
OWN_TEXT = {"nickname": "nick", "avatar": "avatar"}  # не работа: о них своё сообщение
ALL = "*"  # «очистить все»: скрыто всё, что случилось до этого момента
KEY_RE = r"^(\*|(task|decision|reaction|comment):\d{1,18})$"


def _task_events(db: Session, c: Child) -> list[dict]:
    cid = service.class_of(db, c.id)
    if cid is None:
        return []
    done = select(Submission.assignment_id).where(Submission.child_id == c.id)
    rows = db.scalars(
        select(Assignment).where(Assignment.class_id == cid, Assignment.status == "published", Assignment.id.not_in(done))
    )
    return [
        {
            "kind": "task",
            "key": f"task:{a.id}",
            "at": a.created_at,
            "title": a.title,
            "text_i18n": a.text_i18n,
            "image_url": _cover_url(a),
            "link": f"/create?assignment={a.id}" + (f"&template={a.cover_template}" if a.cover_template else ""),
        }
        for a in rows
    ]


def _decision_events(db: Session, c: Child) -> list[dict]:
    rows = db.scalars(
        select(HeldItem).where(
            HeldItem.child_id == c.id,
            HeldItem.status.in_(("approved", "rejected")),
            HeldItem.urgent.is_(False),
            HeldItem.item_type.in_(DECISION_TYPES),
            HeldItem.decided_at.is_not(None),
        )
    )
    return [
        {
            "kind": OWN_TEXT.get(i.item_type, "") + ("approved" if i.status == "approved" else "refused"),
            "key": f"decision:{i.id}",
            "at": i.decided_at,
            "image_url": _approved_thumb(db, i, c),
            "link": "/my-works" if i.status == "approved" or i.item_type in OWN_TEXT else "/create",
        }
        for i in rows
    ]


def _approved_thumb(db: Session, i: HeldItem, c: Child) -> str | None:
    """Какая работа разрешена. У отказа картинки нет: ребёнок не видит то, что взрослый не пропустил."""
    w = _work_of(db, i) if i.status == "approved" else None
    return f"/api/works/{w.id}/image?thumb=1" if w and w.child_id == c.id and w.status == "ready" and w.file_path else None


def _post_events(db: Session, c: Child, model, kind: str, cleared: dict[str, datetime], *extra) -> list[dict]:
    """После очистки счётчик считает только новое: иначе одна новая реакция вернёт и все старые."""
    rows = db.execute(
        select(Post.id, model.created_at)
        .join(model, model.post_id == Post.id)
        .where(Post.child_id == c.id, Post.status == "published", model.child_id != c.id, model.created_at.is_not(None), *extra)
    ).all()
    posts: dict[int, list[datetime]] = {}
    for pid, at in rows:
        if not _is_cleared(cleared, f"{kind}:{pid}", at):
            posts.setdefault(pid, []).append(at)
    return [
        {"kind": kind, "key": f"{kind}:{pid}", "at": max(ats), "count": len(ats), "image_url": f"/api/posts/{pid}/image?thumb=1", "link": "/my-works"}
        for pid, ats in posts.items()
    ]


def _is_cleared(cleared: dict[str, datetime], key: str, at: datetime) -> bool:
    return any(k in cleared and at <= cleared[k] for k in (key, ALL))


def _collapse(events: list[dict]) -> list[dict]:
    """Одинаковые подряд — одна строка со счётчиком. Строка помнит ключи всех, кого вобрала: очистка убирает их разом."""
    rows: list[dict] = []
    for e in events:
        last = rows[-1] if rows else None
        if last and all(last.get(k) == e.get(k) for k in ("kind", "image_url", "title")):
            last["count"] = last.get("count", 1) + e.get("count", 1)
            last["keys"].append(e["key"])
            last["seen_at"] = max(last["seen_at"], e["at"])
        else:
            rows.append({**e, "keys": [e["key"]], "seen_at": e["at"]})
    return rows


@router.get("/child/notifications")
def notifications(c: ChildDep, db: Db) -> dict:
    cleared: dict[str, datetime] = {}
    for key, at in db.execute(select(NoteCleared.key, NoteCleared.cleared_at).where(NoteCleared.child_id == c.id)):
        cleared[key] = max(at, cleared.get(key, at))
    events = [
        *_task_events(db, c),
        *_decision_events(db, c),
        *_post_events(db, c, Reaction, "reaction", cleared),
        *_post_events(db, c, Comment, "comment", cleared, Comment.status == "published"),
    ]
    events = [e for e in events if not _is_cleared(cleared, e["key"], e["at"])]
    events.sort(key=lambda e: e["at"], reverse=True)
    seen = c.notes_seen_at
    items = [
        {**{k: v for k, v in e.items() if k not in ("key", "seen_at")}, "at": e["at"].isoformat(), "unread": seen is None or e["seen_at"] > seen}
        for e in _collapse(events)[:LIMIT]
    ]
    return {"items": items, "unread": sum(1 for i in items if i["unread"])}


class ClearBody(BaseModel):
    # Ключи только известного вида: иначе ребёнок мог бы забить таблицу чем угодно
    keys: Annotated[list[Annotated[str, StringConstraints(pattern=KEY_RE)]], Field(min_length=1, max_length=200)]


@router.post("/child/notifications/clear")
def clear_notifications(body: ClearBody, c: ChildDep, db: Db) -> dict:
    keys = set(body.keys)
    db.execute(delete(NoteCleared).where(NoteCleared.child_id == c.id, NoteCleared.key.in_(keys)))
    db.add_all(NoteCleared(child_id=c.id, key=k, cleared_at=clock.now()) for k in keys)
    db.commit()
    return {"ok": True}


@router.post("/child/notifications/read")
def read_notifications(c: ChildDep, db: Db) -> dict:
    c.notes_seen_at = clock.now()
    db.commit()
    return {"ok": True}
