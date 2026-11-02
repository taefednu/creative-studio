"""«Оживи рисунок» и сказка: ручки, доступ, решения взрослого из «Задержано».

Страницу видит только тот, кто имеет право: автор (пока сказка не задержана), его родитель и учитель
класса (проверка), читатель поста — через service.access в feed. Остальным 404.
"""

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.accounts.adults import child_with_adult
from app.accounts.deps import current_child
from app.accounts.models import Child
from app.accounts.security import COOKIE
from app.accounts.wallet import WalletUnavailable, balance_of
from app.config import get_settings
from app.db import get_session
from app.feed import service
from app.moderation import HeldItem, register
from app.moderation.router import _scope
from app.works.image import pipeline as image_pipeline
from app.works.image.models import Work
from app.works.image.thumbs import thumb_response
from app.works.story import pipeline, source
from app.works.story.models import IN_PROGRESS, Story

router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_session)]


class NewAlive(BaseModel):
    request_id: str = Field(min_length=8, max_length=64)


class NewStory(BaseModel):
    hero_work_id: int
    idea: str | None = Field(default=None, max_length=200)
    request_id: str = Field(min_length=8, max_length=64)


def _enough_coins(db: Session, c: Child, price: int) -> None:
    try:
        bal = balance_of(db, c)
    except WalletUnavailable:
        raise HTTPException(503, "platform_unavailable") from None  # монеты не тронуты
    if bal < price:
        raise HTTPException(402, "not_enough_coins")


# ---------------- «Оживи» ----------------


@router.post("/works/{work_id}/alive")
def make_alive(
    work_id: int,
    body: NewAlive,
    bg: BackgroundTasks,
    c: Annotated[Child, Depends(current_child)],
    db: Db,
):
    """Своя готовая загрузка -> 3D-герой. Рисовать для себя можно и без взрослого, как обычную картинку."""
    existing = db.scalar(select(Work).where(Work.child_id == c.id, Work.request_id == body.request_id))
    if existing:
        if existing.hero_of_work_id != work_id:  # тот же request_id, другая работа: чужую не отдаём
            raise HTTPException(409, "request_id_conflict")
        return {"id": existing.id, "status": existing.status}
    src = db.get(Work, work_id)
    if src is None or src.child_id != c.id or src.kind != "upload" or src.status != "ready":
        raise HTTPException(404, "not_found")
    _enough_coins(db, c, get_settings().IMAGE_PRICE)
    work = Work(
        child_id=c.id,
        kind="alive",
        template_id="alive",
        request_id=body.request_id,
        hero_of_work_id=work_id,
    )
    db.add(work)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        work = db.scalar(select(Work).where(Work.child_id == c.id, Work.request_id == body.request_id))
        assert work is not None
        return {"id": work.id, "status": work.status}
    bg.add_task(image_pipeline.run, work.id)
    return {"id": work.id, "status": work.status}


# ---------------- сказка ----------------


@router.post("/stories")
def create_story(
    body: NewStory, bg: BackgroundTasks, c: Annotated[Child, Depends(child_with_adult)], db: Db
):
    # двойной клик: тот же request_id — та же сказка, второго списания и второй генерации нет
    existing = db.scalar(select(Story).where(Story.child_id == c.id, Story.request_id == body.request_id))
    if existing:
        if existing.hero_work_id != body.hero_work_id:
            raise HTTPException(409, "request_id_conflict")
        return {"id": existing.id, "status": existing.status}
    if source.load(db, body.hero_work_id, c.id, ("alive", "image")) is None:
        raise HTTPException(404, "not_found")  # чужая, неготовая или не та работа
    _enough_coins(db, c, get_settings().STORY_PRICE)
    idea = (body.idea or "").strip() or None
    story = Story(
        child_id=c.id,
        hero_work_id=body.hero_work_id,
        request_id=body.request_id,
        idea=idea,
        lang=c.lang,
    )
    db.add(story)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        story = db.scalar(select(Story).where(Story.child_id == c.id, Story.request_id == body.request_id))
        assert story is not None
        return {"id": story.id, "status": story.status}
    bg.add_task(pipeline.run, story.id)
    return {"id": story.id, "status": story.status}


def _view(s: Story, role: str) -> dict:
    """role: owner | adult. Ребёнок не видит страниц задержанной сказки, в том числе уже готовых."""
    shown = s.status in ("drawing", "ready") if role == "owner" else s.status not in IN_PROGRESS
    pages = []
    for i, p in enumerate(s.pages if shown else []):
        see = p["ok"] if role == "owner" else bool(p.get("file"))
        pages.append(
            {
                "n": i + 1,
                "ok": p["ok"],
                # взрослый решает по тексту, даже если до картинок не дошло; одобрив, он утверждает именно его
                "text": p["text"] if see or role == "adult" else None,
                "image_url": f"/api/stories/{s.id}/pages/{i + 1}/image" if see and p.get("file") else None,
                **({"scene": p["scene"]} if role == "adult" else {}),  # уходит в промпт картинки
            }
        )
    return {
        "id": s.id,
        "hero_work_id": s.hero_work_id,
        "cover_work_id": s.cover_work_id,
        "status": s.status,
        "title": s.title if shown else None,
        "pages": pages,
        "reason_codes": [] if s.status == "support" and role == "owner" else (s.reason_codes or []),
        # только пока пишем: экран показывает ребёнку его же идею
        "idea": s.idea if s.status in IN_PROGRESS or role == "adult" else None,
        "created_at": s.created_at.isoformat(),
    }


def _access(db: Session, cookie: str | None, story_id: int) -> tuple[Story, str]:
    v = service.load_viewer(db, cookie)
    s = db.get(Story, story_id)
    if v is None or s is None:
        raise HTTPException(404, "not_found")
    if v.role == "child" and v.id == s.child_id:
        return s, "owner"
    owner = db.get(Child, s.child_id)
    if v.role == "parent" and owner is not None and owner.parent_id == v.id:
        return s, "adult"
    # Учитель: только сказка, которую ему прислали на проверку (личное остаётся личным).
    if v.role == "teacher" and db.scalar(
        select(HeldItem.id).where(
            HeldItem.item_type == "story", HeldItem.target_id == str(s.id), *_scope("teacher", v.id)
        )
    ):
        return s, "adult"
    raise HTTPException(404, "not_found")


@router.get("/stories/mine")
def my_stories(c: Annotated[Child, Depends(current_child)], db: Db):
    rows = db.scalars(select(Story).where(Story.child_id == c.id).order_by(Story.id.desc()).limit(50))
    return [_view(s, "owner") for s in rows]


@router.get("/stories/{story_id}")
def get_story(story_id: int, db: Db, studio_session: Annotated[str | None, Cookie(alias=COOKIE)] = None):
    s, role = _access(db, studio_session, story_id)
    return _view(s, role)


@router.get("/stories/{story_id}/pages/{n}/image")
def story_page_image(
    story_id: int,
    n: int,
    request: Request,
    db: Db,
    studio_session: Annotated[str | None, Cookie(alias=COOKIE)] = None,
    thumb: bool = False,
):
    s, role = _access(db, studio_session, story_id)
    page = _view(s, role)["pages"]
    page = page[n - 1] if 1 <= n <= len(page) else None
    if page is None or page["image_url"] is None:
        raise HTTPException(404, "not_found")
    path = s.pages[n - 1]["file"]
    if not Path(path).is_file():
        raise HTTPException(404, "not_found")
    if thumb:
        return thumb_response(path, request)
    return FileResponse(path, media_type="image/webp", headers={"Cache-Control": "private"})


# ---- решения взрослого из «Задержано» приходят сюда через реестр ----


def _approve(db: Session, item: HeldItem) -> None:
    s = db.get(Story, int(item.target_id))
    if s is None or s.status not in ("held", "refused"):
        return  # support (срочное) не одобряется
    if not source.origin_ok(db, s.hero_work_id):  # отказ по загрузке: одобрение сказки его не отменяет
        s.status = "refused"
        db.commit()
        return
    if pipeline.complete(s):  # взрослый видел все четыре страницы целиком
        pipeline.finish(db, s)
        return
    # Новая попытка = новое списание.
    s.attempt += 1
    s.status = "checking"
    redraw = bool(s.pages)
    if not redraw:  # задержана на идее: текста ещё нет, пишем
        s.title = None
    # Текст есть (задержан на нём или Muse Image отказал странице): взрослый его видел, остаётся тот же,
    # рисуем только страницы без картинки.
    db.commit()
    pipeline.spawn(s.id, True, redraw)


def _reject(db: Session, item: HeldItem) -> None:
    s = db.get(Story, int(item.target_id))
    # Ребёнок с самоповреждением остаётся на тёплом ответе, не на отказе.
    if s is not None and s.status != "support" and not item.urgent:
        s.status = "refused"
        db.commit()


register("story", _approve, _reject)
