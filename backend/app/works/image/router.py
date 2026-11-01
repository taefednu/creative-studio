from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.accounts import coins
from app.accounts.deps import current_child
from app.accounts.models import Child
from app.accounts.security import COOKIE, read_session
from app.config import get_settings
from app.db import get_session
from app.moderation import HeldItem, register
from app.works.image import pipeline
from app.works.image.models import Work
from app.works.image.templates import BY_ID, TEMPLATES

router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_session)]


class NewWork(BaseModel):
    template_id: str = Field(max_length=30)
    text: str | None = Field(default=None, max_length=200)
    request_id: str = Field(min_length=8, max_length=64)


def _view(w: Work) -> dict:
    return {
        "id": w.id,
        "template_id": w.template_id,
        "status": w.status,
        "reason_codes": w.reason_codes or [],
        "rewrite_text": w.rewrite_text,
        "image_url": f"/api/works/{w.id}/image" if w.status == "ready" else None,
        "created_at": w.created_at.isoformat(),
    }


@router.get("/templates")
def list_templates():
    return {
        "price": get_settings().IMAGE_PRICE,
        "templates": [{"id": t.id, "image_url": f"/templates/{t.id}.webp"} for t in TEMPLATES],
    }


@router.post("/works")
def create_work(
    body: NewWork, bg: BackgroundTasks, c: Annotated[Child, Depends(current_child)], db: Db
):
    if body.template_id not in BY_ID:
        raise HTTPException(422, "bad_template")
    # двойной клик: тот же request_id — тот же work, вторая генерация не создаётся
    existing = db.scalar(select(Work).where(Work.child_id == c.id, Work.request_id == body.request_id))
    if existing:
        return {"id": existing.id, "status": existing.status}
    if coins.balance(db, c.id) < get_settings().IMAGE_PRICE:
        raise HTTPException(402, "not_enough_coins")
    text = (body.text or "").strip() or None
    work = Work(child_id=c.id, template_id=body.template_id, child_text=text, request_id=body.request_id)
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


@router.get("/works/mine")
def my_works(c: Annotated[Child, Depends(current_child)], db: Db):
    rows = db.scalars(
        select(Work).where(Work.child_id == c.id).order_by(Work.id.desc()).limit(100)
    )
    return [_view(w) for w in rows]


def _own(db: Session, c: Child, work_id: int) -> Work:
    w = db.get(Work, work_id)
    if w is None or w.child_id != c.id:
        raise HTTPException(404, "not_found")
    return w


@router.get("/works/{work_id}")
def get_work(work_id: int, c: Annotated[Child, Depends(current_child)], db: Db):
    return _view(_own(db, c, work_id))


@router.get("/works/{work_id}/image")
def work_image(
    work_id: int, db: Db, studio_session: Annotated[str | None, Cookie(alias=COOKIE)] = None
):
    """Автору — только при ready; родителю этого ребёнка — и held (на проверку). Остальным 404."""
    w = db.get(Work, work_id)
    s = read_session(studio_session)
    allowed = False
    if w is not None and w.file_path and s:
        if s[0] == "child":
            allowed = w.child_id == s[1] and w.status == "ready"
        elif s[0] == "parent":
            owner = db.get(Child, w.child_id)
            # родителю — только после проверки картинки (ready) или на проверку (held), не во время генерации
            allowed = (
                owner is not None and owner.parent_id == s[1] and w.status in ("ready", "held")
            )
    if not allowed or w is None or w.file_path is None or not Path(w.file_path).is_file():
        raise HTTPException(404, "not_found")
    return FileResponse(w.file_path, media_type="image/webp", headers={"Cache-Control": "private"})


@router.post("/works/{work_id}/accept")
def accept_work(
    work_id: int, bg: BackgroundTasks, c: Annotated[Child, Depends(current_child)], db: Db
):
    """«Рисуем это»: принять безопасный вариант текста. Атомарно, повтор — no-op."""
    _own(db, c, work_id)
    res = db.execute(
        update(Work)
        .where(Work.id == work_id, Work.child_id == c.id, Work.status == "proposed")
        .values(status="checking")
    )
    db.commit()
    if res.rowcount == 1:  # текст уже проверен: повторно не проверяем
        bg.add_task(pipeline.run, work_id, True)
    return _view(_own(db, c, work_id))


@router.post("/works/{work_id}/decline")
def decline_work(work_id: int, c: Annotated[Child, Depends(current_child)], db: Db):
    """«Нет, другое»: без списания."""
    _own(db, c, work_id)
    db.execute(
        update(Work)
        .where(Work.id == work_id, Work.child_id == c.id, Work.status == "proposed")
        .values(status="refused")
    )
    db.commit()
    return _view(_own(db, c, work_id))


# ---- решения взрослого из «Задержано» (#9) приходят сюда через реестр ----
# Срочное (urgent, самоповреждение) не одобряется: это запрещает decide() в коде.


def _approve(db: Session, item: HeldItem) -> None:
    w = db.get(Work, int(item.target_id))
    if w is None or w.status == "support":
        return
    if item.item_type == "image":
        w.status = "ready"  # монета уже вернулась при задержке; взрослый одобрил показ
        db.commit()
    else:  # prompt: текст одобрен — рисуем заново, новая попытка = новое списание, в фоне
        w.attempt += 1
        w.status = "checking"
        db.commit()
        pipeline.spawn(w.id, True)


def _reject(db: Session, item: HeldItem) -> None:
    w = db.get(Work, int(item.target_id))
    if w is not None:
        w.status = "refused"
        db.commit()


register("image", _approve, _reject)
register("prompt", _approve, _reject)
