"""Сказка на 4 страницы: герой из своей готовой работы, текст Muse Spark, картинки Muse Image."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app import clock
from app.db import Base

PAGES = 4
IN_PROGRESS = ("checking", "writing", "drawing")


class Story(Base):
    __tablename__ = "stories"
    __table_args__ = (UniqueConstraint("child_id", "request_id", name="uq_story_request"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    hero_work_id: Mapped[int] = mapped_column(ForeignKey("works.id"))
    cover_work_id: Mapped[int | None] = mapped_column(ForeignKey("works.id"), nullable=True, index=True)
    request_id: Mapped[str] = mapped_column(String(64))
    idea: Mapped[str | None] = mapped_column(String(300), nullable=True)
    lang: Mapped[str] = mapped_column(String(2))
    # checking, writing, drawing, ready, held, refused, support, failed
    status: Mapped[str] = mapped_column(String(10), default="checking")
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # [{text, scene, file, ok}]: ok = и текст, и картинка страницы прошли проверку
    pages: Mapped[list] = mapped_column(JSON, default=list)
    reason_codes: Mapped[list] = mapped_column(JSON, default=list)
    attempt: Mapped[int] = mapped_column(default=1)  # новая попытка = новые ref_id списания и возврата
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
