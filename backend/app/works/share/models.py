"""Открытая ссылка на работу. Живёт, только пока взрослый разрешил и пост в общей ленте не снят."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app import clock
from app.db import Base


class Share(Base):
    __tablename__ = "shares"
    id: Mapped[int] = mapped_column(primary_key=True)
    work_id: Mapped[int] = mapped_column(ForeignKey("works.id"), unique=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(10), default="waiting")  # waiting | live | off | refused
    post_id: Mapped[int | None] = mapped_column(ForeignKey("posts.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
