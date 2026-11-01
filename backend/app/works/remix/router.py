"""Ремикс (#10): работа одноклассника → своя версия через тот же конвейер, что и обычная картинка
(проверка текста, списание, генерация, проверка картинки, возврат монеты)."""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.accounts.adults import child_with_adult
from app.accounts.deps import current_child
from app.accounts.models import Child
from app.accounts.wallet import WalletUnavailable, balance_of
from app.config import get_settings
from app.db import get_session
from app.feed import service
from app.feed.models import Post
from app.works.image import pipeline
from app.works.image.models import Work
from app.works.image.templates import BY_ID
from app.works.remix import source

router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_session)]


class NewRemix(BaseModel):
    template_id: str | None = Field(default=None, max_length=30)
    text: str | None = Field(default=None, max_length=200)
    request_id: str = Field(min_length=8, max_length=64)


class RemixFlag(BaseModel):
    allowed: bool


@router.post("/posts/{post_id}/remix")
def remix(
    post_id: int,
    body: NewRemix,
    bg: BackgroundTasks,
    c: Annotated[Child, Depends(child_with_adult)],
    db: Db,
):
    # двойной клик: тот же request_id — та же работа, второй генерации и второго списания нет
    existing = db.scalar(select(Work).where(Work.child_id == c.id, Work.request_id == body.request_id))
    if existing:
        if existing.remix_of_post_id != post_id:  # тот же request_id, другой пост: не отдаём чужую работу
            raise HTTPException(409, "request_id_conflict")
        return {"id": existing.id, "status": existing.status}
    post = db.get(Post, post_id)
    # Чужой класс, чужая семья, не опубликовано, скрыто, удалено — поста для ребёнка нет.
    if (
        post is None
        or post.status != "published"
        or post.audience != "class"
        or post.class_id is None
        or service.class_of(db, c.id) != post.class_id
        or source.source_work(db, post) is None
    ):
        raise HTTPException(404, "not_found")
    if post.child_id == c.id:
        raise HTTPException(403, "own_post")
    if not source.open_for_remix(post):  # «Лучшее» или автор запретил
        raise HTTPException(403, "remix_not_allowed")
    tid = body.template_id
    text = (body.text or "").strip() or None
    if tid is not None and tid not in BY_ID:
        raise HTTPException(422, "bad_template")
    if tid is None and text is None:
        raise HTTPException(422, "template_or_text_required")
    try:
        bal = balance_of(db, c)
    except WalletUnavailable:
        raise HTTPException(503, "platform_unavailable") from None
    if bal < get_settings().IMAGE_PRICE:
        raise HTTPException(402, "not_enough_coins")
    work = Work(
        child_id=c.id,
        template_id=tid or "remix",
        child_text=text,
        request_id=body.request_id,
        remix_of_post_id=post.id,
    )
    db.add(work)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        work = db.scalar(select(Work).where(Work.child_id == c.id, Work.request_id == body.request_id))
        assert work is not None
        return {"id": work.id, "status": work.status}
    bg.add_task(pipeline.run, work.id)
    return {"id": work.id, "status": work.status}


@router.post("/posts/{post_id}/remix-allowed")
def set_remix_allowed(
    post_id: int, body: RemixFlag, c: Annotated[Child, Depends(current_child)], db: Db
):
    """Автор разрешает или запрещает ремиксы своего поста."""
    post = db.get(Post, post_id)
    if post is None or post.child_id != c.id or post.status in ("deleted", "hidden", "rejected"):
        raise HTTPException(404, "not_found")
    post.remix_allowed = body.allowed
    db.commit()
    return {"id": post.id, "remix_allowed": post.remix_allowed}
