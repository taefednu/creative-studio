"""Источник героя: только `file_path` своей готовой работы, то есть то, что уже видит ребёнок.

У загрузки это размытая версия; оригинал (`orig/`) сюда не попадает и в модель не уходит.
"""

from pathlib import Path

from sqlalchemy.orm import Session

from app.works.image.models import Work


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
    try:
        return Path(w.file_path).read_bytes()
    except OSError:
        return None
