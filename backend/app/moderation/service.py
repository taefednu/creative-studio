"""hold() создаёт запись; решение взрослого идёт через реестр обработчиков вида работы."""

from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import update
from sqlalchemy.orm import Session

from app import clock
from app.moderation.models import ITEM_TYPES, REVIEWERS, HeldItem

Handler = Callable[[Session, HeldItem], None]


@dataclass
class Handlers:
    on_approve: Handler
    on_reject: Handler


_registry: dict[str, Handlers] = {}


def register(item_type: str, on_approve: Handler, on_reject: Handler) -> None:
    """Модуль вида работы регистрирует себя; экран «Задержано» зовёт decide(), не зная видов."""
    _registry[item_type] = Handlers(on_approve, on_reject)


def hold(
    db: Session,
    *,
    item_type: str,
    target_id: str | int,
    child_id: int,
    reviewer: str,
    reason_codes: list[str] | None = None,
    urgent: bool = False,
    class_id: int | None = None,
    preview_text: str | None = None,
    commit: bool = True,
) -> HeldItem:
    """Срочное (urgent) всегда уходит обоим взрослым: правило одно для всех мест."""
    if urgent:
        reviewer = "both"
    assert item_type in ITEM_TYPES and reviewer in REVIEWERS
    item = HeldItem(
        item_type=item_type,
        target_id=str(target_id),
        child_id=child_id,
        class_id=class_id,
        reviewer=reviewer,
        reason_codes=list(reason_codes or []),
        urgent=urgent,
        preview_text=preview_text,
    )
    db.add(item)
    if commit:
        db.commit()
    return item


def decide(db: Session, item: HeldItem, approve: bool, by: str) -> bool:
    """False — ничего не изменено: уже решено, нет обработчика или срочное (его не одобряют).

    Запись забирается атомарным UPDATE ... WHERE status='pending': повторное и параллельное
    решение не проходит, обработчик зовётся ровно один раз.
    """
    h = _registry.get(item.item_type)
    if h is None or (approve and item.urgent):
        return False
    res = db.execute(
        update(HeldItem)
        .where(HeldItem.id == item.id, HeldItem.status == "pending")
        .values(
            status="approved" if approve else "rejected",
            decided_at=clock.now(),
            decided_by=by,
        )
    )
    db.commit()
    if res.rowcount != 1:
        return False
    db.refresh(item)
    (h.on_approve if approve else h.on_reject)(db, item)
    return True
