"""Что можно ремиксить (#10). Один набор правил для ручки и для конвейера (повтор в момент генерации).

Источник — только `file_path` работы: у загрузки это размытая версия, оригинал сюда не попадает.
"""

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.feed.models import Post
from app.works.image.models import Work


def source_work(db: Session, post: Post) -> Work | None:
    """Работа поста, если её картинка есть и прошла проверку (ready); иначе None."""
    w = db.get(Work, post.work_id)
    if w is None or w.status != "ready" or not w.file_path or not Path(w.file_path).is_file():
        return None
    return w


def open_for_remix(post: Post) -> bool:
    return (
        post.status == "published"
        and post.audience == "class"
        and not post.best
        and post.remix_allowed
        and post.work_kind != "page"  # обложка сказки: ремикс страницы не нужен
    )


def load(db: Session, post_id: int) -> bytes | None:
    post = db.get(Post, post_id)
    if post is None or not open_for_remix(post):
        return None
    w = source_work(db, post)
    if w is None or w.file_path is None:
        return None
    try:
        return Path(w.file_path).read_bytes()
    except OSError:
        return None


def alive(db: Session, post_id: int | None) -> bool:
    """Исходник ещё на месте: пост опубликован, картинка есть. Проверка перед ready, одобрением
    и публикацией; запрет ремиксов автором здесь не смотрим (он касается только новых)."""
    post = db.get(Post, post_id) if post_id is not None else None
    return post is not None and post.status == "published" and source_work(db, post) is not None


def hide_remixes(db: Session, post_id: int) -> None:
    """Взрослый скрыл или отклонил пост: его ремиксы (и ремиксы ремиксов) тоже hidden.
    Без commit: вызывающий коммитит всё одной транзакцией."""
    queue = [post_id]
    while queue:
        pid = queue.pop()
        rows = db.scalars(
            select(Post).where(
                Post.work_id.in_(select(Work.id).where(Work.remix_of_post_id == pid)),
                Post.status.in_(("pending", "published", "held")),
            )
        ).all()
        for p in rows:
            p.status = "hidden"
            queue.append(p.id)
