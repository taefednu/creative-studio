"""Единые часы: тесты подменяют now(), чтобы проверять 5 минут и 15 минут без ожидания."""

from datetime import UTC, date, datetime


def now() -> datetime:
    """Наивное время UTC (SQLite хранит без пояса)."""
    return datetime.now(UTC).replace(tzinfo=None)


def today() -> date:
    return now().date()
