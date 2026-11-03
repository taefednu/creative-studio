"""Задания учителя (#13).

Текст задания идёт в check_text(kind="assignment") как данные. Учитель сам проверяющий:
не allow или сбой модели — задание не сохраняется, детям оно не доходит. Сдача работы:
картинка уже прошла check_image в #6; необязательный комментарий проходит check_text("caption"),
любой не-allow или сбой — «на проверку учителю».
"""

import base64
import binascii
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.accounts.adults import AdultChild
from app.accounts.deps import current_child, current_teacher
from app.accounts.models import Child, Teacher
from app.accounts.security import COOKIE
from app.assignments.models import Assignment, Submission
from app.config import get_settings
from app.db import get_session
from app.feed import service
from app.feed.models import Post
from app.moderation import HeldItem, hold, register
from app.works.image.models import Work
from app.works.image.templates import TEMPLATES
from app.works.upload.pipeline import UploadError, normalize, to_jpeg, to_webp

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
    cover_template: str | None = None
    cover_image: str | None = Field(default=None, max_length=8_000_000)  # base64: лимиты файла проверяет normalize


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


def _cover_url(a: Assignment) -> str | None:
    if a.cover_path:
        return f"/api/assignments/{a.id}/cover"
    return f"/templates/{a.cover_template}.webp" if a.cover_template else None


# Тонкая обёртка: тесты подменяют её поддельной моделью.
def check_cover(data: bytes, lang: str):
    from app.safety import check_image

    return check_image(data, "upload", lang)


def _checked_cover(raw: str, lang: str) -> bytes:
    """Своя картинка учителя видна всему классу: сбой или не-allow, и задание не сохраняется."""
    try:
        im = normalize(base64.b64decode(raw, validate=True))
    except binascii.Error:
        raise HTTPException(415, "unsupported_type") from None
    except UploadError as e:
        raise HTTPException(e.status, e.code) from None
    d = check_cover(to_jpeg(im), lang)
    if getattr(d, "model_error", False):
        raise HTTPException(503, "check_unavailable")
    if d.action != "allow":
        raise HTTPException(422, "cover_rejected")
    return to_webp(im)


# ---------------- учитель: задания ----------------


def _teacher_view(db: Session, a: Assignment) -> dict:
    n = db.scalar(  # детей, а не работ: «сдали 4 из 12»
        select(func.count(func.distinct(Submission.child_id))).where(
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
        "cover_url": _cover_url(a),
        "submissions": n or 0,
        "created_at": a.created_at.isoformat(),
    }


@router.post("/teacher/classes/{class_id}/assignments", status_code=201)
def create_assignment(class_id: int, body: NewAssignment, t: TeacherDep, db: Db):
    _own_class(db, t, class_id)
    title, desc = body.title.strip(), body.description.strip()
    if not title:
        raise HTTPException(422, "validation")
    if body.cover_template is not None and body.cover_template not in {x.id for x in TEMPLATES}:
        raise HTTPException(422, "validation")
    d = service.judge(f"{title}\n{desc}".strip(), "assignment", body.lang)
    if d is None or getattr(d, "model_error", False):
        raise HTTPException(503, "check_unavailable")  # сбой проверки: не сохраняем
    if d.action != "allow":
        raise HTTPException(422, "assignment_rejected")
    cover = _checked_cover(body.cover_image, body.lang) if body.cover_image else None
    a = Assignment(
        class_id=class_id, teacher_id=t.id, title=title, description=desc,
        due_at=_naive_utc(body.due_at), status="published", cover_template=None if cover else body.cover_template,
    )
    db.add(a)
    db.flush()
    if cover:
        path = Path(get_settings().UPLOAD_DIR) / "covers" / f"{a.id}.webp"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(cover)
        a.cover_path = str(path)
    db.commit()
    return _teacher_view(db, a)


@router.get("/teacher/classes/{class_id}/assignments")
def teacher_assignments(class_id: int, t: TeacherDep, db: Db):
    _own_class(db, t, class_id)
    rows = db.scalars(
        select(Assignment)
        .where(Assignment.class_id == class_id, Assignment.status != "closed")
        .order_by(Assignment.id.desc())
    )
    return [_teacher_view(db, a) for a in rows]


@router.post("/teacher/assignments/{assignment_id}/close")
def close_assignment(assignment_id: int, t: TeacherDep, db: Db):
    """Завершить: дети больше не видят и не могут сдать; сданные работы остаются."""
    a = _own_assignment(db, t, assignment_id)
    a.status = "closed"
    db.commit()
    return {"id": a.id, "status": a.status}


@router.get("/assignments/{assignment_id}/cover")
def assignment_cover(assignment_id: int, db: Db, v: V):
    a = db.get(Assignment, assignment_id)
    ok = a is not None and (
        (v.role == "teacher" and service.teacher_owns(db, v.id, a.class_id))
        or (v.role == "child" and service.class_of(db, v.id) == a.class_id)
    )
    if not ok or a is None or not a.cover_path or not Path(a.cover_path).is_file():
        raise HTTPException(404, "not_found")
    return FileResponse(a.cover_path, media_type="image/webp", headers={"Cache-Control": "private"})


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
    # Взрослый убрал работу или автор удалил свой пост: снова не выкладываем.
    if any(p.status in ("hidden", "rejected", "deleted") for p in posts):
        raise HTTPException(409, "removed_by_adult")
    live = [p for p in posts if p.status in service.LIVE_POST]
    if not live:
        db.add(
            Post(
                work_id=s.work_id, work_kind=w.kind, child_id=s.child_id, audience="class",
                class_id=a.class_id, caption=s.comment, status="published",
            )
        )
    # Задержанный пост ещё не показан: флаг говорит правду.
    shown = not live or any(p.status == "published" for p in live)
    s.shown_in_feed = shown
    try:
        db.commit()
    except IntegrityError:  # ребёнок опубликовал ту же работу в эту секунду: дубля нет
        db.rollback()
        raise HTTPException(409, "already_in_feed") from None
    return {"id": s.id, "shown_in_feed": shown}


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
    subs = list(
        db.scalars(
            select(Submission).where(
                Submission.child_id == c.id, Submission.assignment_id.in_([a.id for a in rows])
            )
        )
    )
    # Срочная сдача: ребёнок не видит «на проверке», только тёплый ответ в момент сдачи.
    urgent = set(
        db.scalars(
            select(HeldItem.target_id).where(
                HeldItem.item_type == "submission",
                HeldItem.urgent.is_(True),
                HeldItem.target_id.in_([str(s.id) for s in subs]),
            )
        )
    )
    mine: dict[int, list[dict]] = {}
    for s in subs:
        mine.setdefault(s.assignment_id, []).append(
            {"work_id": s.work_id, "status": s.status, "support": str(s.id) in urgent}
        )
    return [
        {
            "id": a.id,
            "title": a.title,
            "description": a.description,
            "due_at": _due(a),
            "cover_url": _cover_url(a),
            "cover_template": a.cover_template,
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
def submit(assignment_id: int, body: NewSubmission, c: AdultChild, db: Db):
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
    # Модель зовём до первой записи: SQLite держит блокировку до коммита, а проверка идёт секунды.
    d = service.judge(comment, "caption", c.lang) if comment is not None else None
    # без комментария — картинка уже прошла check_image в #6
    clean = comment is None or (d is not None and d.action == "allow")
    s = Submission(
        assignment_id=a.id,
        work_id=w.id,
        child_id=c.id,
        comment=comment,
        status="accepted" if clean else "held",
    )
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
    if not clean:
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
    # Срочное закрыто просмотром: это не отказ, ребёнок остаётся на тёплом ответе.
    if s is not None and s.status == "held" and not item.urgent:
        s.status = "rejected"
        db.commit()


register("submission", _approve, _reject)
