"""Задания учителя и сдачи работ (spec §2, §6 п.4–5)."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app import clock
from app.db import Base

ASSIGNMENT_STATUSES = ("published", "held", "closed")
SUBMISSION_STATUSES = ("pending", "accepted", "held", "rejected")


class Assignment(Base):
    __tablename__ = "assignments"
    id: Mapped[int] = mapped_column(primary_key=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classrooms.id"), index=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id"))
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(1000), default="")
    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="published", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
    text_i18n: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {язык: {title, description}}, см. translate.py
    cover_template: Mapped[str | None] = mapped_column(String(40), nullable=True)  # стиль: и картинка, и стиль в «Создать»
    cover_path: Mapped[str | None] = mapped_column(String(300), nullable=True)  # своя картинка учителя, прошла проверку


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (UniqueConstraint("assignment_id", "child_id", "work_id", name="uq_submission"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id"), index=True)
    work_id: Mapped[int] = mapped_column(ForeignKey("works.id"), index=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    comment: Mapped[str | None] = mapped_column(String(300), nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)
    shown_in_feed: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
