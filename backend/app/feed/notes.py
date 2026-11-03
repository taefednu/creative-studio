"""Колокольчик ребёнка: события собираются из того, что уже записано, отдельной таблицы нет.

Только то, что касается самого ребёнка. Срочное сюда не попадает: тёплый ответ он уже получил, а
«взрослому сообщили о тебе» в списке новостей его напугает. Чужих ников и текстов нет.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import clock
from app.accounts.deps import current_child
from app.accounts.models import Child
from app.assignments.models import Assignment, Submission
from app.assignments.router import _cover_url
from app.db import get_session
from app.feed import service
from app.feed.models import Comment, Post, Reaction
from app.moderation import HeldItem

router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_session)]
ChildDep = Annotated[Child, Depends(current_child)]

LIMIT = 20
DECISION_TYPES = ("post", "comment", "prompt", "image", "upload", "story", "share")


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
            "kind": "approved" if i.status == "approved" else "refused",
            "at": i.decided_at,
            "link": "/my-works" if i.status == "approved" else "/create",
        }
        for i in rows
    ]


def _post_events(db: Session, c: Child, model, kind: str, *extra) -> list[dict]:
    rows = db.execute(
        select(Post.id, func.count(model.id), func.max(model.created_at))
        .join(model, model.post_id == Post.id)
        .where(Post.child_id == c.id, Post.status == "published", model.child_id != c.id, model.created_at.is_not(None), *extra)
        .group_by(Post.id)
    ).all()
    return [
        {"kind": kind, "at": at, "count": n, "image_url": f"/api/posts/{pid}/image?thumb=1", "link": "/my-works"}
        for pid, n, at in rows
    ]


@router.get("/child/notifications")
def notifications(c: ChildDep, db: Db) -> dict:
    events = [
        *_task_events(db, c),
        *_decision_events(db, c),
        *_post_events(db, c, Reaction, "reaction"),
        *_post_events(db, c, Comment, "comment", Comment.status == "published"),
    ]
    events.sort(key=lambda e: e["at"], reverse=True)
    seen = c.notes_seen_at
    items = [{**e, "at": e["at"].isoformat(), "unread": seen is None or e["at"] > seen} for e in events[:LIMIT]]
    return {"items": items, "unread": sum(1 for i in items if i["unread"])}


@router.post("/child/notifications/read")
def read_notifications(c: ChildDep, db: Db) -> dict:
    c.notes_seen_at = clock.now()
    db.commit()
    return {"ok": True}
