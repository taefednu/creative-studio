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
    has_data = bool(created or published or held or entries)
    # Нет данных — null, а не нули: пустое состояние с объяснением рисует экран.
    return {
        "child_id": child.id,
        "days": DAYS,
        "has_data": has_data,
        "created": created if has_data else None,
        "published": published if has_data else None,
        "held": held if has_data else None,  # только число: ни содержания, ни срочного текста
        "coins_received": gained if has_data else None,  # старт и дневные монеты студии
        "coins_earned_lessons": None,  # уроки Mentorium: появится с платформой (#5), сейчас нет данных
        "coins_uncertain": uncertain,  # монет в записях без подтверждения платформы
        "coins_spent": max(0, charged - refunded) if has_data else None,  # возвраты вычтены
    }
