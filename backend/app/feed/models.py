"""Лента, реакции, комментарии (spec §2, §5, §10). Пост ссылается на work_id и вид, не на картинку."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app import clock
from app.db import Base

AUDIENCES = ("class", "family")
POST_STATUSES = ("pending", "published", "held", "rejected", "hidden", "deleted")
COMMENT_STATUSES = ("pending", "published", "held", "rejected")
REACTIONS = ("star", "heart", "laugh", "wow")


class Post(Base):
    __tablename__ = "posts"
    id: Mapped[int] = mapped_column(primary_key=True)
    work_id: Mapped[int] = mapped_column(ForeignKey("works.id"), index=True)
    work_kind: Mapped[str] = mapped_column(String(10), default="image")
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    audience: Mapped[str] = mapped_column(String(7))  # class | family
    class_id: Mapped[int | None] = mapped_column(ForeignKey("classrooms.id"), nullable=True, index=True)
    caption: Mapped[str | None] = mapped_column(String(300), nullable=True)  # только проверенная
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)
    best: Mapped[bool] = mapped_column(default=False, index=True)  # ставит только скрипт команды
    remix_allowed: Mapped[bool] = mapped_column(default=True, server_default=text("1"))  # автор может выключить
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
    # Живой пост один на работу и аудиторию: гонка публикации и «показать в ленте» не даст дубль.
    __table_args__ = (
        Index(
            "uq_live_post",
            "work_id",
            "audience",
            unique=True,
            sqlite_where=text("status IN ('pending', 'published', 'held')"),
        ),
    )


class Reaction(Base):
    __tablename__ = "reactions"
    __table_args__ = (UniqueConstraint("post_id", "child_id", "kind", name="uq_reaction"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"), index=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"))
    kind: Mapped[str] = mapped_column(String(8))


class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"), index=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    text: Mapped[str] = mapped_column(String(600))  # публикуемый текст (или held — виден автору и взрослому)
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)


class CommentSuggestion(Base):
    """«Скажи добрее?»: хранится только проверенная добрая версия, грубый оригинал — никогда."""

    __tablename__ = "comment_suggestions"
    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"))
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    kinder_text: Mapped[str] = mapped_column(String(600))
    status: Mapped[str] = mapped_column(String(10), default="open")  # open | accepted | cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
