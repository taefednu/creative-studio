"""Кабинет родителя: тарифы (#11) и аналитика ребёнка (#14). Только чтение, только свои дети."""

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import clock
from app.accounts.deps import current_parent
from app.accounts.models import Child, CoinLedger, Parent
from app.config import get_settings
from app.db import get_session
from app.feed.models import Post
from app.moderation import HeldItem
from app.works.image.models import Work
from app.works.image.templates import TEMPLATES
from app.works.story.models import Story

router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_session)]
DAYS = 7
DONE = CoinLedger.status == "done"
UNSURE = ("pending", "sending", "refund_pending", "uncertain")


@router.get("/parent/tariffs")
def tariffs(_: Annotated[Parent, Depends(current_parent)]):
    """Пакеты из конфига. Покупка пока недоступна; платёжных полей нет."""
    return {
        "purchase_available": False,
        "packs": [p.model_dump() for p in get_settings().COIN_PACKS],
    }


def _count(db: Session, model, *where) -> int:
    return int(db.scalar(select(func.count()).select_from(model).where(*where)) or 0)


@router.get("/parent/children/{child_id}/works")
def child_works(child_id: int, p: Annotated[Parent, Depends(current_parent)], db: Db):
    """Все готовые работы ребёнка своему родителю. post_id: показана семье, оттуда работу можно скрыть."""
    child = db.get(Child, child_id)
    if child is None or child.parent_id != p.id:
        raise HTTPException(404, "not_found")
    works = db.scalars(
        select(Work).where(Work.child_id == child.id, Work.status == "ready").order_by(Work.id.desc()).limit(60)
    ).all()
    shown = dict(
        db.execute(
            select(Post.work_id, Post.id).where(
                Post.work_id.in_([w.id for w in works]), Post.audience == "family", Post.status == "published"
            )
        ).all()
    )
    return [
        {
            "id": w.id,
            "kind": w.kind,
            "hero_of_work_id": w.hero_of_work_id,
            "image_url": f"/api/works/{w.id}/image",
            "post_id": shown.get(w.id),
        }
        for w in works
    ]


@router.get("/parent/children/{child_id}/analytics")
def analytics(child_id: int, p: Annotated[Parent, Depends(current_parent)], db: Db):
    child = db.get(Child, child_id)
    if child is None or child.parent_id != p.id:
        raise HTTPException(404, "not_found")
    since = clock.now() - timedelta(days=DAYS)
    created = _count(db, Work, Work.child_id == child.id, Work.created_at >= since, Work.status == "ready")
    published = _count(
        db, Post, Post.child_id == child.id, Post.created_at >= since, Post.status == "published"
    )
    held = _count(db, HeldItem, HeldItem.child_id == child.id, HeldItem.created_at >= since)
    led = (CoinLedger.child_id == child.id, CoinLedger.created_at >= since)
    entries = _count(db, CoinLedger, *led, CoinLedger.delta != 0)  # нулевая дневная запись — не событие
    gained = int(
        db.scalar(
            select(func.coalesce(func.sum(CoinLedger.delta), 0)).where(
                *led, CoinLedger.delta > 0, CoinLedger.reason != "refund", DONE
            )
        )
        or 0
    )
    charged = int(
        db.scalar(
            select(func.coalesce(func.sum(-CoinLedger.delta), 0)).where(*led, CoinLedger.delta < 0, DONE)
        )
        or 0
    )
    refunded = int(
        db.scalar(
            select(func.coalesce(func.sum(CoinLedger.delta), 0)).where(*led, CoinLedger.reason == "refund", DONE)
        )
        or 0
    )
    # Платформа: pending, sending, refund_pending, uncertain не факт, но и не ноль: считаем отдельно.
    uncertain = int(
        db.scalar(
            select(func.coalesce(func.sum(func.abs(CoinLedger.delta)), 0)).where(
                *led, CoinLedger.status.in_(UNSURE)
            )
        )
        or 0
    )
    # Время каждой готовой работы, а не счётчики по дням: «день» считает браузер в поясе родителя.
    ready_at = db.scalars(
        select(Work.created_at).where(Work.child_id == child.id, Work.created_at >= since, Work.status == "ready")
    ).all()
    has_data = bool(created or published or held or entries)
    # Нет данных — null, а не нули: пустое состояние с объяснением рисует экран.
    # За всё время, не за неделю: уровень как у ребёнка, загруженные рисунки не считаются
    pictures_total = _count(db, Work, Work.child_id == child.id, Work.status == "ready", Work.kind != "upload")
    ready_kinds = db.execute(
        select(Work.kind, Work.template_id).where(Work.child_id == child.id, Work.status == "ready")
    ).all()
    return {
        "child_id": child.id,
        "pictures_total": pictures_total,
        # Награды как у ребёнка в «Моих работах», за всё время
        "achieved": {
            "alive": any(kind == "alive" for kind, _ in ready_kinds),
            "story": _count(db, Story, Story.child_id == child.id, Story.status == "ready") > 0,
            "shared": _count(db, Post, Post.child_id == child.id, Post.status == "published") > 0,
            "styles": {t.id for t in TEMPLATES} <= {tpl for _, tpl in ready_kinds},
        },
        "days": DAYS,
        "has_data": has_data,
        "created": created if has_data else None,
        "ready_at": [t.isoformat() for t in ready_at],
        "published": published if has_data else None,
        "held": held if has_data else None,  # только число: ни содержания, ни срочного текста
        "coins_received": gained if has_data else None,  # старт и дневные монеты студии
        "coins_earned_lessons": None,  # уроки Mentorium: появится с платформой (#5), сейчас нет данных
        "coins_uncertain": uncertain,  # монет в записях без подтверждения платформы
        "coins_spent": max(0, charged - refunded) if has_data else None,  # возвраты вычтены
    }
