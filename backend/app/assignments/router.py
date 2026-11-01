"""Задания учителя (#13).

Текст задания идёт в check_text(kind="assignment") как данные. Учитель сам проверяющий:
не allow или сбой модели — задание не сохраняется, детям оно не доходит. Сдача работы:
картинка уже прошла check_image в #6; необязательный комментарий проходит check_text("caption"),
любой не-allow или сбой — «на проверку учителю».
"""

from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.accounts.deps import current_child, current_teacher
from app.accounts.models import Child, Teacher
from app.accounts.security import COOKIE
from app.assignments.models import Assignment, Submission
from app.db import get_session
from app.feed import service
from app.feed.models import Post
from app.moderation import HeldItem, hold, register
from app.works.image.models import Work

router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_session)]
TeacherDep = Annotated[Teacher, Depends(current_teacher)]
ChildDep = Annotated[Child, Depends(current_child)]


def _viewer(db: Db, studio_session: Annotated[str | None, Cookie(alias=COOKIE)] = None) -> service.Viewer:
    v = service.load_viewer(db, studio_session)
    if v is None:
        raise HTTPException(401, "unauthorized")
    return v


V = Annotated[service.Viewer, Depends(_viewer)]


class NewAssignment(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)
    due_at: datetime | None = None
    lang: str = Field(default="ru", pattern="^(ru|en|uz)$")


class NewSubmission(BaseModel):
    work_id: int
    comment: str | None = Field(default=None, max_length=200)


def _naive_utc(d: datetime | None) -> datetime | None:
    if d is not None and d.tzinfo is not None:
        return d.astimezone(UTC).replace(tzinfo=None)
    return d


def _own_class(db: Session, t: Teacher, class_id: int) -> None:
    if not service.teacher_owns(db, t.id, class_id):
        raise HTTPException(404, "not_found")


def _own_assignment(db: Session, t: Teacher, assignment_id: int) -> Assignment:
    a = db.get(Assignment, assignment_id)
    if a is None or not service.teacher_owns(db, t.id, a.class_id):
        raise HTTPException(404, "not_found")
    return a


def _due(a: Assignment) -> str | None:
    return a.due_at.isoformat() if a.due_at else None


# ---------------- учитель: задания ----------------


def _teacher_view(db: Session, a: Assignment) -> dict:
    n = db.scalar(
        select(func.count()).select_from(Submission).where(
            Submission.assignment_id == a.id, Submission.status == "accepted"
        )
    )
    return {
        "id": a.id,
        "class_id": a.class_id,
        "title": a.title,
        "description": a.description,
        "due_at": _due(a),
        "status": a.status,
        "submissions": n or 0,
        "created_at": a.created_at.isoformat(),
    }


@router.post("/teacher/classes/{class_id}/assignments", status_code=201)
def create_assignment(class_id: int, body: NewAssignment, t: TeacherDep, db: Db):
    _own_class(db, t, class_id)
    title, desc = body.title.strip(), body.description.strip()
    if not title:
        raise HTTPException(422, "validation")
    d = service.judge(f"{title}\n{desc}".strip(), "assignment", body.lang)
    if d is None or getattr(d, "model_error", False):
        raise HTTPException(503, "check_unavailable")  # сбой проверки: не сохраняем
    if d.action != "allow":
        raise HTTPException(422, "assignment_rejected")
    a = Assignment(
        class_id=class_id, teacher_id=t.id, title=title, description=desc,
        due_at=_naive_utc(body.due_at), status="published",
    )
    db.add(a)
    db.commit()
    return _teacher_view(db, a)


@router.get("/teacher/classes/{class_id}/assignments")
def teacher_assignments(class_id: int, t: TeacherDep, db: Db):
    _own_class(db, t, class_id)
    rows = db.scalars(select(Assignment).where(Assignment.class_id == class_id).order_by(Assignment.id.desc()))
    return [_teacher_view(db, a) for a in rows]


@router.get("/teacher/assignments/{assignment_id}/submissions")
def teacher_submissions(assignment_id: int, t: TeacherDep, db: Db):
    a = _own_assignment(db, t, assignment_id)
    rows = db.execute(
        select(Submission, Child.nick)
        .join(Child, Child.id == Submission.child_id)
        .where(Submission.assignment_id == a.id, Submission.status.in_(("accepted", "held")))
        .order_by(Submission.id.desc())
    ).all()
    return [
        {
            "id": s.id,
            "nick": nick,
            "status": s.status,
            "shown_in_feed": s.shown_in_feed,
            "image_url": f"/api/submissions/{s.id}/image",
            "comment": s.comment if s.status == "accepted" else None,
            "created_at": s.created_at.isoformat(),
        }
        for s, nick in rows
    ]


@router.get("/submissions/{submission_id}/image")
def submission_image(submission_id: int, db: Db, v: V):
    s = db.get(Submission, submission_id)
    a = db.get(Assignment, s.assignment_id) if s is not None else None
    ok = (
        s is not None
        and a is not None
        and (
            (v.role == "child" and v.id == s.child_id)
            or (v.role == "teacher" and service.teacher_owns(db, v.id, a.class_id))
        )
    )
    w = db.get(Work, s.work_id) if ok and s is not None else None
    if w is None or not w.file_path or not Path(w.file_path).is_file():
        raise HTTPException(404, "not_found")
    return FileResponse(w.file_path, media_type="image/webp", headers={"Cache-Control": "private"})


@router.post("/teacher/submissions/{submission_id}/show-in-feed")
def show_in_feed(submission_id: int, t: TeacherDep, db: Db):
    s = db.get(Submission, submission_id)
    a = db.get(Assignment, s.assignment_id) if s is not None else None
    if s is None or a is None or not service.teacher_owns(db, t.id, a.class_id):
        raise HTTPException(404, "not_found")
    if s.status != "accepted":
        raise HTTPException(409, "not_accepted")
    w = db.get(Work, s.work_id)
    if w is None or w.status != "ready":
        raise HTTPException(409, "work_not_ready")
    posts = list(
        db.scalars(
            select(Post).where(
                Post.work_id == s.work_id, Post.audience == "class", Post.class_id == a.class_id
            )
        )
    )
    if any(p.status in ("hidden", "rejected") for p in posts):  # взрослый уже убрал эту работу
        raise HTTPException(409, "removed_by_adult")
    if not any(p.status in ("pending", "published", "held") for p in posts):
        db.add(
            Post(
                work_id=s.work_id, work_kind=w.kind, child_id=s.child_id, audience="class",
                class_id=a.class_id, caption=s.comment, status="published",
            )
        )
    s.shown_in_feed = True
    db.commit()
    return {"id": s.id, "shown_in_feed": True}


# ---------------- ребёнок ----------------


@router.get("/child/assignments")
def child_assignments(c: ChildDep, db: Db):
    cid = service.class_of(db, c.id)
    if cid is None:
        return []
    rows = list(
        db.scalars(
            select(Assignment)
            .where(Assignment.class_id == cid, Assignment.status == "published")
            .order_by(Assignment.due_at.is_(None), Assignment.due_at, Assignment.id)
        )
    )
    mine: dict[int, list[dict]] = {}
    for s in db.scalars(
        select(Submission).where(
            Submission.child_id == c.id, Submission.assignment_id.in_([a.id for a in rows])
        )
    ):
        mine.setdefault(s.assignment_id, []).append({"work_id": s.work_id, "status": s.status})
    return [
        {
            "id": a.id,
            "title": a.title,
            "description": a.description,
            "due_at": _due(a),
            "submissions": mine.get(a.id, []),
        }
        for a in rows
    ]


def _existing(db: Session, a: Assignment, c: Child, w: Work) -> Submission | None:
    return db.scalar(
        select(Submission).where(
            Submission.assignment_id == a.id, Submission.child_id == c.id, Submission.work_id == w.id
        )
    )


def _result(db: Session, s: Submission) -> dict:
    urgent = db.scalar(
        select(HeldItem.id).where(
            HeldItem.item_type == "submission", HeldItem.target_id == str(s.id), HeldItem.urgent.is_(True)
        )
    )
    return {"id": s.id, "status": s.status, "support": urgent is not None}


@router.post("/assignments/{assignment_id}/submit")
def submit(assignment_id: int, body: NewSubmission, c: ChildDep, db: Db):
    a = db.get(Assignment, assignment_id)
    if a is None or a.status != "published" or service.class_of(db, c.id) != a.class_id:
        raise HTTPException(404, "not_found")
    w = db.get(Work, body.work_id)
    if w is None or w.child_id != c.id:
        raise HTTPException(404, "not_found")
    if w.status != "ready":
        raise HTTPException(409, "work_not_ready")
    dup = _existing(db, a, c, w)
    if dup is not None:
        return _result(db, dup)
    comment = (body.comment or "").strip() or None
    # Пока комментарий не проверен, сдача «held»: не видна ни учителю в галерее как принятая, ни детям.
    s = Submission(assignment_id=a.id, work_id=w.id, child_id=c.id, comment=comment, status="held")
    db.add(s)
    try:
        db.flush()
    except IntegrityError:  # двойной клик
        db.rollback()
        dup = _existing(db, a, c, w)
        if dup is None:
            raise
        return _result(db, dup)
    support = False
    if comment is None:
        s.status = "accepted"  # картинка уже прошла check_image в #6
    else:
        d = service.judge(comment, "caption", c.lang)
        if d is not None and d.action == "allow":
            s.status = "accepted"
        else:
            support = d is not None and (d.action == "support" or bool(getattr(d, "urgent", False)))
            hold(
                db,
                item_type="submission",
                target_id=s.id,
                child_id=c.id,
                reviewer="teacher",
                reason_codes=service._codes(d) if d is not None else ["check_failed"],
                urgent=support,
                class_id=a.class_id,
                preview_text=comment,
                commit=False,
            )
    db.commit()
    return {"id": s.id, "status": s.status, "support": support}


# ---- решения учителя из «Задержано» ----


def _approve(db: Session, item: HeldItem) -> None:
    s = db.get(Submission, int(item.target_id))
    if s is not None and s.status == "held":
        s.status = "accepted"
        db.commit()


def _reject(db: Session, item: HeldItem) -> None:
    s = db.get(Submission, int(item.target_id))
    if s is not None and s.status == "held":
        s.status = "rejected"
        db.commit()


register("submission", _approve, _reject)
