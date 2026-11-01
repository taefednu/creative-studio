from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app import clock
from app.db import Base

STATUSES = (
    "proposed","checking", "generating", "ready", "refused", "held", "support", "failed")


class Work(Base):
    __tablename__ = "works"
    __table_args__ = (UniqueConstraint("child_id", "request_id", name="uq_work_request"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10), default="image")
    template_id: Mapped[str] = mapped_column(String(30))
    child_text: Mapped[str | None] = mapped_column(String(300), nullable=True)
    rewrite_text: Mapped[str | None] = mapped_column(String(2000), nullable=True)  # «давай так: …»
    safe_prompt: Mapped[str | None] = mapped_column(String(3000), nullable=True)  # ушло в генерацию
    status: Mapped[str] = mapped_column(String(12), default="checking")
    file_path: Mapped[str | None] = mapped_column(String(300), nullable=True)
    request_id: Mapped[str] = mapped_column(String(64))
    reason_codes: Mapped[list] = mapped_column(JSON, default=list)
    # Ремикс (#10): пост, из картинки которого сделана работа. Сама картинка не хранится.
    remix_of_post_id: Mapped[int | None] = mapped_column(ForeignKey("posts.id"), nullable=True)
    attempt: Mapped[int] = mapped_column(default=1)  # новая попытка = новые ref_id списания и возврата
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
