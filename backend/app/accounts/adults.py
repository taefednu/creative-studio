"""Есть ли у ребёнка взрослый (#5): родитель или учитель класса. Без взрослого публиковать нельзя."""

from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.deps import current_child
from app.accounts.models import Child, ClassMembership
from app.db import get_session


def has_adult(db: Session, child: Child) -> bool:
    if child.parent_id is not None:
        return True
    return db.scalar(select(ClassMembership.id).where(ClassMembership.child_id == child.id)) is not None


def child_with_adult(
    c: Annotated[Child, Depends(current_child)], db: Annotated[Session, Depends(get_session)]
) -> Child:
    """Публикация, комментарии, реакции: без родителя и без класса -> 403 needs_adult.

    Причина: ребёнка Mentorium без взрослого никто не проверяет и не видит его сигналов.
    Рисовать для себя можно: эти ручки сюда не подключены.
    """
    if not has_adult(db, c):
        raise HTTPException(403, "needs_adult")
    return c


AdultChild = Annotated[Child, Depends(child_with_adult)]
