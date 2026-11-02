from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.accounts.deps import current_child
from app.accounts.models import Child
from app.assignments.models import Submission
from app.config import get_settings
from app.db import get_session
from app.feed.models import Post
from app.moderation import HeldItem, register
from app.works.image.models import Work
from app.works.upload import pipeline

router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_session)]


@router.post("/works/upload")
def upload(
    bg: BackgroundTasks,
    c: Annotated[Child, Depends(current_child)],
    db: Db,
    file: Annotated[UploadFile, File()],
    request_id: Annotated[str | None, Form(min_length=8, max_length=64)] = None,
):
    """Загрузка фото или рисунка. Разбор и SAM — в фоне; статус как у остальных работ."""
    rid = request_id or uuid4().hex
    existing = db.scalar(select(Work).where(Work.child_id == c.id, Work.request_id == rid))
    if existing:
        return {"id": existing.id, "status": existing.status}
    data = file.file.read(get_settings().UPLOAD_MAX_BYTES + 1)
    try:
        im = pipeline.normalize(data)
    except pipeline.UploadError as e:
        raise HTTPException(e.status, e.code) from None
    work = Work(child_id=c.id, kind="upload", template_id="upload", request_id=rid)
    db.add(work)
    try:
        db.flush()
        pipeline.save_original(work.id, im)
        db.commit()
    except IntegrityError:
        db.rollback()
        work = db.scalar(select(Work).where(Work.child_id == c.id, Work.request_id == rid))
        assert work is not None
        return {"id": work.id, "status": work.status}
    bg.add_task(pipeline.run, work.id)
    return {"id": work.id, "status": work.status}


# ---- решения взрослого (#9) приходят сюда через реестр ----


def _approve(db: Session, item: HeldItem) -> None:
    w = db.get(Work, int(item.target_id))
    if w is None or w.status != "held":
        return  # ready: размытая версия уже доступна, одобрение ничего не меняет
    # Задержана до SAM: взрослый видел оригинал, но детям он не пойдёт — SAM прогоняем теперь.
    w.status = "checking"
    db.commit()
    pipeline.spawn(w.id, True)


def _reject(db: Session, item: HeldItem) -> None:
    w = db.get(Work, int(item.target_id))
    if w is None or w.status == "support" or item.urgent:
        return  # срочное (самоповреждение) не становится отказом: ребёнок остаётся на поддержке
    w.status = "refused"
    from app.works.remix.source import hide_remixes
    from app.works.story.models import Story

    # Герои «оживления» и сказки на них: та же картинка, уходят вместе с загрузкой (посты hidden,
    # сказка и герой refused: источником не станут). Дальше — как для самой загрузки.
    heroes = db.scalars(select(Work).where(Work.hero_of_work_id == w.id)).all()
    stories = db.scalars(select(Story).where(Story.hero_work_id.in_([h.id for h in heroes]))).all()
    covers = db.scalars(select(Work).where(Work.id.in_([s.cover_work_id for s in stories]))).all()
    for h in heroes:
        h.status = "refused"
    for c in covers:
        c.status = "refused"
    for s in stories:
        if s.status != "support":
            s.status = "refused"
    derived = [x.id for x in (*heroes, *covers)]
    db.execute(
        update(Post)
        .where(Post.work_id.in_(derived), Post.status.in_(("pending", "held", "published")))
        .values(status="hidden")
    )
    # Ремиксы отклонённой загрузки уходят вместе с ней: в них та же картинка.
    for post_id in db.scalars(select(Post.id).where(Post.work_id.in_([w.id, *derived]))).all():
        hide_remixes(db, post_id)
    db.execute(
        update(Post)
        .where(Post.work_id == w.id, Post.status.in_(("pending", "held", "published")))
        .values(status="rejected")
    )
    db.execute(  # сданное в задание тоже уходит из галереи и из показа в ленте
        update(Submission)
        .where(Submission.work_id == w.id, Submission.status.in_(("pending", "accepted", "held")))
        .values(status="rejected")
    )
    db.commit()


register("upload", _approve, _reject)
