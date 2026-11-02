"""Источник героя: только `file_path` своей готовой работы, то есть то, что уже видит ребёнок.

У загрузки это размытая версия; оригинал (`orig/`) сюда не попадает и в модель не уходит.
"""

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.feed.models import Post
from app.works.image.models import Work


def origin_ok(db: Session, work_id: int | None) -> bool:
    """Герой и загрузка, из которой он сделан, не отклонены взрослым. Читаем свежее: отказ мог прийти из другого запроса."""
    w = db.get(Work, work_id, populate_existing=True) if work_id is not None else None
    if w is None or w.status != "ready":
        return False
    if w.hero_of_work_id is None:
        return True
    up = db.get(Work, w.hero_of_work_id, populate_existing=True)
    return up is not None and up.status == "ready"


def load(db: Session, work_id: int | None, child_id: int, kinds: tuple[str, ...]) -> bytes | None:
    w = db.get(Work, work_id) if work_id is not None else None
    if (
        w is None
        or w.child_id != child_id
        or w.kind not in kinds
        or w.status != "ready"
        or not w.file_path
    ):
        return None
    if not origin_ok(db, work_id):  # загрузку отклонили: и герой из неё больше не источник
        return None
    # Герой сказки: не ремикс (его правила «только класс, пока исходник жив» сказка бы обошла) и
    # без поста, снятого взрослым. У загрузки это не смотрим: «оживить» для себя можно всегда.
    if w.kind != "upload" and (
        w.remix_of_post_id is not None
        or db.scalar(
            select(Post.id).where(Post.work_id == w.id, Post.status.in_(("hidden", "rejected")))
        )
        is not None
    ):
        return None
    try:
        return Path(w.file_path).read_bytes()
    except OSError:
        return None
