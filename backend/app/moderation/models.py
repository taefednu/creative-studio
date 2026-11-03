"""Общая очередь «Задержано» для всех видов работ (spec §2, §10). Экран и ручки — #9."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app import clock
from app.db import Base

ITEM_TYPES = ("prompt", "image", "post", "comment", "nickname", "assignment", "submission", "upload", "story", "share")
REVIEWERS = ("parent", "teacher", "both")


class HeldItem(Base):
    __tablename__ = "held_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    item_type: Mapped[str] = mapped_column(String(20), index=True)
    target_id: Mapped[str] = mapped_column(String(40))
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    class_id: Mapped[int | None] = mapped_column(ForeignKey("classrooms.id"), nullable=True)
    reviewer: Mapped[str] = mapped_column(String(10))  # parent | teacher | both
    reason_codes: Mapped[list] = mapped_column(JSON, default=list)
    urgent: Mapped[bool] = mapped_column(default=False)
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)
    preview_text: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    decided_by: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Срочное получают оба взрослых, поэтому «просмотрено» у каждого своё.
    seen_parent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    seen_teacher_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
