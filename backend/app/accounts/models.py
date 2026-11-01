from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app import clock
from app.db import Base


class Parent(Base):
    __tablename__ = "parents"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    pw_hash: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)


class Teacher(Base):
    __tablename__ = "teachers"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    pw_hash: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)


class Child(Base):
    __tablename__ = "children"
    id: Mapped[int] = mapped_column(primary_key=True)
    nick: Mapped[str] = mapped_column(String(24))
    nick_norm: Mapped[str] = mapped_column(String(24), unique=True)  # ник уникален глобально
    age_group: Mapped[str] = mapped_column(String(5))  # "5-8" | "9-12"
    lang: Mapped[str] = mapped_column(String(2))  # ru | en | uz
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("parents.id"), nullable=True)
    picture_password_hash: Mapped[str] = mapped_column(String(300))
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)


class Classroom(Base):
    __tablename__ = "classrooms"
    id: Mapped[int] = mapped_column(primary_key=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id"))
    name: Mapped[str] = mapped_column(String(60))
    code: Mapped[str] = mapped_column(String(6), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)


class ClassMembership(Base):
    __tablename__ = "class_memberships"
    __table_args__ = (UniqueConstraint("child_id", name="uq_one_class_per_child"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"))
    class_id: Mapped[int] = mapped_column(ForeignKey("classrooms.id"))
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)


class CoinLedger(Base):
    """Баланс = сумма delta. ref_id уникален: повторная операция с тем же id не проходит (#6)."""

    __tablename__ = "coin_ledger"
    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    delta: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(40))
    ref_id: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)


class ParentNotification(Base):
    __tablename__ = "parent_notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    parent_id: Mapped[int] = mapped_column(ForeignKey("parents.id"), index=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"))
    kind: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
    read: Mapped[bool] = mapped_column(default=False)


class QrToken(Base):
    """Одноразовый вход. В базе только sha256 токена."""

    __tablename__ = "qr_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class CodeAttempt(Base):
    """Неверные коды класса: лимит перебора по ребёнку."""

    __tablename__ = "code_attempts"
    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
