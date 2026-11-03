"""Экран «Задержано» (#9): один список для двух взрослых.

Учитель видит выложенное в его классы, родитель — личное своих детей; срочное (самоповреждение)
видят оба, но одобрить его нельзя: взрослый его «просмотрел». Чужая запись — 404, не 403.
"""

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import clock
from app.accounts.deps import current_child
from app.accounts.models import Child, ClassMembership, Classroom
from app.accounts.security import COOKIE, read_session
from app.assignments.models import Submission
from app.db import get_session
from app.feed.models import Comment, Post
from app.moderation.models import HeldItem
from app.moderation.service import close_urgent, decide
from app.works.image.models import Work
from app.works.share.models import Share
from app.works.story.models import Story

router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_session)]

IMAGE_TYPES = ("image", "post", "submission", "upload", "share", "avatar")  # у остальных видов своей картинки нет


def adult(
    db: Db, studio_session: Annotated[str | None, Cookie(alias=COOKIE)] = None
) -> tuple[str, int]:
    s = read_session(studio_session)
    if not s or s[0] not in ("parent", "teacher"):
        raise HTTPException(401, "unauthorized")
    return s[0], s[1]


Adult = Annotated[tuple[str, int], Depends(adult)]


def _scope(role: str, uid: int):
    """Условие «это проверка этого взрослого». Один фильтр на список, счётчик и ручки по id."""
    if role == "teacher":
        rooms = select(Classroom.id).where(Classroom.teacher_id == uid)
        # Срочное личное (промпт, семейный пост: class_id пуст) учитель тоже получает, если ребёнок
        # в его классе: сигнал о самоповреждении идёт обоим взрослым. Несрочное личное — нет.
        in_class = HeldItem.child_id.in_(
            select(ClassMembership.child_id).where(ClassMembership.class_id.in_(rooms))
        )
        mine = HeldItem.reviewer.in_(("teacher", "both")) & (
            HeldItem.class_id.in_(rooms)
            | (HeldItem.urgent.is_(True) & (HeldItem.reviewer == "both") & in_class)
        )
        # Ребёнок класса без родителя (вход через Mentorium): личное, что иначе ушло бы родителю,
        # проверяет учитель. Появился родитель — записи идут ему, старые остаются видны родителю.
        orphan = (
            (HeldItem.reviewer == "parent")
            & in_class
            & HeldItem.child_id.in_(select(Child.id).where(Child.parent_id.is_(None)))
        )
        return (mine | orphan,)
    return (
        HeldItem.reviewer.in_(("parent", "both")),
        HeldItem.child_id.in_(select(Child.id).where(Child.parent_id == uid)),
    )


def _seen_col(role: str):
    return HeldItem.seen_teacher_at if role == "teacher" else HeldItem.seen_parent_at


def _pending(role: str, uid: int):
    # Просмотренное срочное уходит только из очереди этого взрослого: второй ещё должен его увидеть.
    return select(HeldItem).where(
        HeldItem.status == "pending", _seen_col(role).is_(None), *_scope(role, uid)
    )


def _mine(db: Session, who: tuple[str, int], item_id: int) -> HeldItem:
    item = db.scalar(select(HeldItem).where(HeldItem.id == item_id, *_scope(*who)))
    if item is None:
        raise HTTPException(404, "not_found")
    return item


def _where(item: HeldItem) -> str:
    if item.class_id is not None:
        return "class"
    return "family" if item.item_type in ("post", "comment") else "personal"


def _work_of(db: Session, item: HeldItem) -> Work | None:
    if item.item_type in ("image", "upload", "avatar"):
        return db.get(Work, int(item.target_id))
    if item.item_type == "post":
        p = db.get(Post, int(item.target_id))
        return db.get(Work, p.work_id) if p is not None else None
    if item.item_type == "submission":
        s = db.get(Submission, int(item.target_id))
        return db.get(Work, s.work_id) if s is not None else None
    if item.item_type == "share":
        sh = db.get(Share, int(item.target_id))
        return db.get(Work, sh.work_id) if sh is not None else None
    return None


def _has_image(db: Session, item: HeldItem) -> bool:
    w = _work_of(db, item)
    if item.item_type == "upload":
        return w is not None and (_upload_file(w, "original") or _upload_file(w, "blurred")) is not None
    return w is not None and bool(w.file_path) and Path(w.file_path).is_file()


def _upload_file(w: Work, version: str) -> Path | None:
    """Загрузка: оригинал читает только проверяющий (эта ручка); file_path — размытая версия."""
    from app.works.upload.pipeline import original_path

    p = original_path(w.id) if version == "original" else Path(w.file_path or "")
    return p if p.is_file() else None


def _view(db: Session, item: HeldItem, nick: str, class_name: str | None, full: bool) -> dict:
    # В списке текст срочного не отдаём; в «Открыть» (full) отдаём.
    show = full or not item.urgent
    return {
        "id": item.id,
        "item_type": item.item_type,
        "nick": nick,
        "where": _where(item),
        "class_id": item.class_id,
        "class_name": class_name,
        "reason_codes": item.reason_codes or [],
        "urgent": item.urgent,
        "status": item.status,
        "created_at": item.created_at.isoformat(),
        "preview_text": item.preview_text if show else None,
        # сказка: взрослый открывает GET /api/stories/{story_id} и читает все страницы
        "story_id": int(item.target_id) if show and item.item_type == "story" else None,
        "image_url": f"/api/review/items/{item.id}/image"
        if show and item.item_type in IMAGE_TYPES and _has_image(db, item)
        else None,
        **_upload_urls(db, item, show),
    }


def _upload_urls(db: Session, item: HeldItem, show: bool) -> dict:
    """Загрузка: оригинал и размытая рядом (blurred_url пуст, если до SAM дело не дошло)."""
    if item.item_type not in ("upload", "post", "submission"):
        return {}
    w = _work_of(db, item) if show else None
    if item.item_type != "upload" and (w is None or w.kind != "upload"):
        return {}  # обычная работа: оригинала нет
    base = f"/api/review/items/{item.id}/image?version="
    return {
        "original_url": base + "original" if w and _upload_file(w, "original") else None,
        "blurred_url": base + "blurred" if w and _upload_file(w, "blurred") else None,
    }


def _views(db: Session, items: list[HeldItem], full: bool = False) -> list[dict]:
    if not items:
        return []
    nicks = dict(
        db.execute(select(Child.id, Child.nick).where(Child.id.in_({i.child_id for i in items}))).all()
    )
    rooms = dict(
        db.execute(
            select(Classroom.id, Classroom.name).where(
                Classroom.id.in_({i.class_id for i in items if i.class_id is not None})
            )
        ).all()
    )
    return [_view(db, i, nicks.get(i.child_id, ""), rooms.get(i.class_id), full) for i in items]


@router.get("/review/queue")
def queue(db: Db, who: Adult):
    q = _pending(*who).order_by(HeldItem.urgent.desc(), HeldItem.created_at.desc(), HeldItem.id.desc())
    return _views(db, list(db.scalars(q)))


@router.get("/review/count")
def count(db: Db, who: Adult):
    rows = list(db.scalars(_pending(*who)))
    return {"count": len(rows), "urgent": sum(1 for i in rows if i.urgent)}


@router.get("/review/items/{item_id}")
def item_detail(item_id: int, db: Db, who: Adult):
    return _views(db, [_mine(db, who, item_id)], full=True)[0]


@router.get("/review/items/{item_id}/image")
def item_image(item_id: int, db: Db, who: Adult, version: str | None = None):
    item = _mine(db, who, item_id)
    w = _work_of(db, item) if item.item_type in IMAGE_TYPES else None
    if w is not None and w.kind == "upload":
        if version not in (None, "original", "blurred"):
            raise HTTPException(422, "bad_version")
        p = _upload_file(w, version) if version else (
            _upload_file(w, "blurred") or _upload_file(w, "original")
        )
        if p is None:
            raise HTTPException(404, "not_found")
        return FileResponse(p, media_type="image/webp", headers={"Cache-Control": "private"})
    if w is None or not w.file_path or not Path(w.file_path).is_file():
        raise HTTPException(404, "not_found")
    return FileResponse(w.file_path, media_type="image/webp", headers={"Cache-Control": "private"})


def _by(who: tuple[str, int]) -> str:
    return f"{who[0]}:{who[1]}"


def _settle(db: Session, item: HeldItem, approve: bool, who: tuple[str, int]) -> dict:
    target = "approved" if approve else "rejected"
    if item.urgent:
        raise HTTPException(409, "urgent_not_approvable")
    if item.status == target:
        return {"id": item.id, "status": item.status}  # повтор: ничего не меняем
    if item.status != "pending":
        raise HTTPException(409, "already_decided")
    ok = decide(db, item, approve, _by(who))
    db.refresh(item)
    if not ok and item.status != target:
        raise HTTPException(409, "already_decided")
    return {"id": item.id, "status": item.status}


@router.post("/review/items/{item_id}/approve")
def approve(item_id: int, db: Db, who: Adult):
    return _settle(db, _mine(db, who, item_id), True, who)


@router.post("/review/items/{item_id}/reject")
def reject(item_id: int, db: Db, who: Adult):
    return _settle(db, _mine(db, who, item_id), False, who)


@router.post("/review/items/{item_id}/seen")
def seen(item_id: int, db: Db, who: Adult):
    """Отметка своя у каждого взрослого; запись закрывается, когда посмотрели все, кто её получает."""
    item = _mine(db, who, item_id)
    if not item.urgent:
        raise HTTPException(409, "not_urgent")
    db.execute(
        update(HeldItem).where(HeldItem.id == item.id).values({_seen_col(who[0]): clock.now()})
    )
    db.commit()
    db.refresh(item)
    child = db.get(Child, item.child_id)
    has_teacher = db.scalar(
        select(ClassMembership.id).where(ClassMembership.child_id == item.child_id)
    )
    waiting_parent = child is not None and child.parent_id and item.seen_parent_at is None
    waiting_teacher = has_teacher is not None and item.seen_teacher_at is None
    if not waiting_parent and not waiting_teacher:
        close_urgent(db, item, _by(who))
        db.refresh(item)
    return {"id": item.id, "status": item.status}


@router.get("/held/mine")
def held_mine(c: Annotated[Child, Depends(current_child)], db: Db):
    """Ребёнку: что взрослый решил не публиковать. Срочное сюда не попадает: ребёнку «блока» нет."""
    rows = db.scalars(
        select(HeldItem)
        .where(
            HeldItem.child_id == c.id,
            HeldItem.status == "rejected",
            HeldItem.urgent.is_(False),
            HeldItem.item_type.in_(("post", "comment", "prompt", "image", "upload", "story", "share")),
        )
        .order_by(HeldItem.id.desc())
        .limit(20)
    )
    out = []
    for i in rows:
        if i.item_type == "post":
            p = db.get(Post, int(i.target_id))
            text = p.caption if p is not None else None
        elif i.item_type in ("upload", "share"):
            text = None  # у загрузки и просьбы поделиться нет текста ребёнка
        elif i.item_type == "story":
            st = db.get(Story, int(i.target_id))
            text = st.idea if st is not None else None  # его же слова, не текст модели
        elif i.item_type in ("prompt", "image"):
            w = db.get(Work, int(i.target_id))
            text = w.child_text if w is not None else None
        else:
            cm = db.get(Comment, int(i.target_id))
            text = cm.text if cm is not None else None
        out.append({"id": i.id, "item_type": i.item_type, "text": text})
    return out
