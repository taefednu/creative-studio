"""Доступ к постам, проверка подписей и комментариев, обработчики решений взрослого.

Правило одно: в ленту и в комментарии попадает только allow, посчитанный кодом, или решение
взрослого. Любой сбой проверки — «на проверку взрослому», никогда «опубликовать».
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.models import Child, ClassMembership, Classroom, Parent, Teacher
from app.accounts.security import read_session
from app.feed.models import Comment, Post
from app.moderation import HeldItem, hold, register
from app.works.remix.source import hide_remixes

OPEN_STATUSES = ("pending", "held")  # не опубликовано: видят автор и проверяющий взрослый
LIVE_POST = ("pending", "published", "held")


# Тонкая обёртка: тесты подменяют её поддельной моделью.
def check_text(text: str, kind: str, lang: str):
    from app.safety import check_text as f

    return f(text, kind, lang)  # type: ignore[arg-type]


@dataclass
class Viewer:
    role: str  # child | parent | teacher | guest
    obj: Child | Parent | Teacher | None = None  # у гостя нет записи: id 0 не совпадёт ни с кем

    @property
    def id(self) -> int:
        return self.obj.id if self.obj is not None else 0


def load_viewer(db: Session, token: str | None) -> Viewer | None:
    s = read_session(token)
    if not s:
        return None
    model = {"child": Child, "parent": Parent, "teacher": Teacher}.get(s[0])
    obj = db.get(model, s[1]) if model else None
    return Viewer(s[0], obj) if obj is not None else None


def class_of(db: Session, child_id: int) -> int | None:
    return db.scalar(select(ClassMembership.class_id).where(ClassMembership.child_id == child_id))


def teacher_owns(db: Session, teacher_id: int, class_id: int | None) -> bool:
    room = db.get(Classroom, class_id) if class_id is not None else None
    return room is not None and room.teacher_id == teacher_id


def access(db: Session, v: Viewer, post: Post) -> str | None:
    """'author' | 'reader' | 'reviewer' | None. None = для этого человека поста нет (404)."""
    if post.status in ("deleted", "hidden", "rejected"):
        return None
    author = db.get(Child, post.child_id)
    if author is None:
        return None
    is_author = v.role == "child" and v.id == post.child_id
    if post.status in OPEN_STATUSES:
        if is_author:
            return "author"
        if v.role == "parent" and author.parent_id == v.id:
            return "reviewer"
        if v.role == "teacher" and post.audience == "class" and teacher_owns(db, v.id, post.class_id):
            return "reviewer"
        return None
    # published
    if is_author:
        return "author"
    if post.best:
        return "reader"
    if v.role == "child":
        if post.audience == "class":
            return "reader" if post.class_id is not None and class_of(db, v.id) == post.class_id else None
        mine = v.obj.parent_id  # type: ignore[union-attr]
        return "reader" if mine is not None and mine == author.parent_id else None
    if v.role == "parent":
        return "reader" if author.parent_id == v.id else None
    if v.role == "teacher":
        return "reader" if post.audience == "class" and teacher_owns(db, v.id, post.class_id) else None
    return None


def reviewer_for(audience: str) -> str:
    return "teacher" if audience == "class" else "parent"


def _codes(d) -> list[str]:
    codes = list(getattr(d, "reason_codes", None) or [])
    return codes or ["held"]


def judge(text: str, kind: str, lang: str):
    """(decision | None). Любое исключение — None, и вызывающий задерживает."""
    try:
        return check_text(text, kind, lang)
    except Exception:  # noqa: BLE001
        return None


def hold_for(db: Session, *, item_type: str, target_id: int, child_id: int, post: Post,
             d, text: str) -> bool:
    """Кладёт в очередь. Возвращает urgent (support): ребёнку тогда тёплый ответ."""
    urgent = d is not None and (d.action == "support" or bool(getattr(d, "urgent", False)))
    hold(
        db,
        item_type=item_type,
        target_id=target_id,
        child_id=child_id,
        reviewer=reviewer_for(post.audience),
        reason_codes=_codes(d) if d is not None else ["check_failed"],
        urgent=urgent,
        class_id=post.class_id,
        preview_text=text,
        commit=False,
    )
    return urgent


# ---- решения взрослого из «Задержано» (#9) приходят сюда через реестр ----


def _approve_post(db: Session, item: HeldItem) -> None:
    p = db.get(Post, int(item.target_id))
    if p is not None and p.status in OPEN_STATUSES:
        p.status = "published"
        db.commit()


def _reject_post(db: Session, item: HeldItem) -> None:
    p = db.get(Post, int(item.target_id))
    # Срочное закрыто просмотром: это не отказ, ребёнок остаётся на тёплом ответе.
    if p is not None and p.status in OPEN_STATUSES and not item.urgent:
        p.status = "rejected"
        hide_remixes(db, p.id)
        db.commit()


def _approve_comment(db: Session, item: HeldItem) -> None:
    c = db.get(Comment, int(item.target_id))
    if c is not None and c.status in OPEN_STATUSES:
        c.status = "published"
        db.commit()


def _reject_comment(db: Session, item: HeldItem) -> None:
    c = db.get(Comment, int(item.target_id))
    if c is not None and c.status in OPEN_STATUSES and not item.urgent:
        c.status = "rejected"
        db.commit()


register("post", _approve_post, _reject_post)
register("comment", _approve_comment, _reject_comment)
