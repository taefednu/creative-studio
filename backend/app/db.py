from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


_engine = None
_session_factory = None


def get_engine():
    global _engine, _session_factory
    if _engine is None:
        from app.config import get_settings

        url = get_settings().DATABASE_URL
        if url.startswith("sqlite:///") and ":memory:" not in url:
            Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
        _engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 30})
        _session_factory = sessionmaker(_engine, expire_on_commit=False)
    return _engine


def init_db() -> None:
    Base.metadata.create_all(get_engine())


def get_session() -> Iterator[Session]:
    get_engine()
    assert _session_factory is not None
    with _session_factory() as session:
        yield session


def new_session() -> Session:
    """Своя сессия для фоновых задач (вне запроса). Закрывает вызывающий."""
    get_engine()
    assert _session_factory is not None
    return _session_factory()
