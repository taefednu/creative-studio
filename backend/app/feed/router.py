from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.accounts.adults import AdultChild
from app.accounts.models import Child
from app.accounts.security import COOKIE
from app.db import get_session
from app.feed import service
from app.feed.models import REACTIONS, Comment, CommentSuggestion, Post, Reaction
from app.feed.service import Viewer
from app.moderation import hold
from app.moderation.models import HeldItem
from app.works.image.models import Work
from app.works.image.thumbs import thumb_response
from app.works.remix.source import alive, hide_remixes, open_for_remix
from app.works.story.models import Story

router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_session)]
Cookie_ = Annotated[str | None, Cookie(alias=COOKIE)]


def viewer(db: Db, studio_session: Cookie_ = None) -> Viewer:
    v = service.load_viewer(db, studio_session)
    if v is None:
        raise HTTPException(401, "unauthorized")
    return v


V = Annotated[Viewer, Depends(viewer)]


def viewer_or_guest(db: Db, studio_session: Cookie_ = None) -> Viewer:
    """Открытая витрина: без входа, в service.access гостю доступны только посты «Лучшее»."""
    return service.load_viewer(db, studio_session) or Viewer("guest")


Guest = Annotated[Viewer, Depends(viewer_or_guest)]


class NewPost(BaseModel):
    work_id: int
    audience: str = Field(pattern="^(class|family)$")
    caption: str | None = Field(default=None, max_length=200)


class NewComment(BaseModel):
    text: str = Field(max_length=300)


def _get_post(db: Session, v: Viewer, post_id: int) -> tuple[Post, str]:
    p = db.get(Post, post_id)
    role = service.access(db, v, p) if p is not None else None
    if p is None or role is None:
        raise HTTPException(404, "not_found")
    return p, role


# ---------------- публикация ----------------


def _origin_chain(db: Session, w: Work) -> list[Work]:
    """Работа и всё, из чего она сделана: обложка сказки -> герой -> загрузка под «оживлением».
    Решение взрослого про любое звено (отказ, шлюз загрузки, снятый пост, правила ремикса) держит
    и для производных."""
    chain = [w]
    if w.kind == "page":
        hero_id = db.scalar(select(Story.hero_work_id).where(Story.cover_work_id == w.id))
        hero = db.get(Work, hero_id) if hero_id is not None else None
        if hero is not None:
            chain.append(hero)
    if chain[-1].hero_of_work_id is not None:
        up = db.get(Work, chain[-1].hero_of_work_id)
        if up is not None:
            chain.append(up)
    return chain


@router.post("/posts")
def publish(body: NewPost, c: AdultChild, db: Db):
    w = db.get(Work, body.work_id)
    if w is None or w.child_id != c.id:
        raise HTTPException(404, "not_found")
    if w.status != "ready":
        raise HTTPException(409, "work_not_ready")
    chain = _origin_chain(db, w)
    if any(x.status != "ready" for x in chain):  # звено отклонено взрослым: производное не показываем
        raise HTTPException(409, "removed_by_adult")
    chain_ids = [x.id for x in chain]
    for x in chain:
        if x.remix_of_post_id is not None:
            if body.audience != "class":  # ремикс — работа одноклассника, за пределы класса не уходит
                raise HTTPException(409, "remix_class_only")
            if not alive(db, x.remix_of_post_id):  # исходник скрыли или удалили, пока ремикс ждал
                raise HTTPException(409, "remix_source_gone")
    class_id = service.class_of(db, c.id)
    if body.audience == "class" and class_id is None:
        raise HTTPException(409, "no_class")
    if body.audience == "family" and c.parent_id is None:
        raise HTTPException(409, "no_parent")
    # Взрослый скрыл или отклонил пост этой работы в этой аудитории — повторно не выложить.
    removed = db.scalar(
        select(Post.id).where(
            Post.work_id.in_(chain_ids),
            Post.audience == body.audience,
            Post.status.in_(("hidden", "rejected")),
        )
    )
    if removed is not None:
        raise HTTPException(409, "removed_by_adult")
    # двойной клик: живой пост этой работы этой аудитории уже есть — возвращаем его
    dup = db.scalar(
        select(Post).where(
            Post.work_id == w.id,
            Post.audience == body.audience,
            Post.status.in_(("pending", "published", "held")),
        )
    )
    if dup is not None:
        urgent = db.scalar(
            select(HeldItem.id).where(
                HeldItem.item_type == "post", HeldItem.target_id == str(dup.id), HeldItem.urgent
            )
        )
        return {"id": dup.id, "status": dup.status, "support": urgent is not None}
    caption = (body.caption or "").strip() or None
    # Модель зовём до первой записи: SQLite держит блокировку до коммита, а проверка идёт секунды.
    d = service.judge(caption, "caption", c.lang) if caption is not None else None
    # За время проверки взрослый мог отклонить работу: свежий статус, иначе пост уйдёт в ленту.
    db.refresh(w)
    if w.status != "ready":
        raise HTTPException(409, "work_not_ready")
    # без подписи — картинка уже прошла check_image в #6; подпись прошла проверку выше
    clean = caption is None or (d is not None and d.action == "allow")
    # Загрузку с размытым или задержанным ждёт учитель класса: он видит оригинал и размытую.
    gated = (
        clean
        and body.audience == "class"
        and db.scalar(
            select(HeldItem.id).where(
                HeldItem.item_type == "upload", HeldItem.target_id.in_([str(i) for i in chain_ids])
            )
        )
        is not None
    )
    post = Post(
        work_id=w.id,
        work_kind=w.kind,
        child_id=c.id,
        audience=body.audience,
        class_id=class_id if body.audience == "class" else None,
        caption=caption,
        status="published" if clean and not gated else "held",
    )
    db.add(post)
    support = False
    try:
        db.flush()
        if gated:
            hold(
                db,
                item_type="post",
                target_id=post.id,
                child_id=c.id,
                reviewer="teacher",
                reason_codes=list(w.reason_codes or []) or ["upload_review"],
                class_id=class_id,
                commit=False,
            )
        elif not clean:
            support = service.hold_for(
                db, item_type="post", target_id=post.id, child_id=c.id, post=post, d=d, text=caption
            )
        db.commit()
    except IntegrityError:  # двойной клик за время проверки: живой пост уже есть
        db.rollback()
        dup = db.scalar(
            select(Post).where(
                Post.work_id == w.id, Post.audience == body.audience, Post.status.in_(service.LIVE_POST)
            )
        )
        if dup is None:
            raise
        return {"id": dup.id, "status": dup.status, "support": False}
    return {"id": post.id, "status": post.status, "support": support}


# ---------------- ленты ----------------


def _urgent_targets(db: Session, item_type: str, ids: list[int]) -> set[int]:
    rows = db.scalars(
        select(HeldItem.target_id).where(
            HeldItem.item_type == item_type, HeldItem.urgent.is_(True), HeldItem.target_id.in_([str(i) for i in ids])
        )
    )
    return {int(t) for t in rows}


def _page(db: Session, v: Viewer, q, before: int | None, limit: int) -> dict:
    q = q.where(Post.status == "published")
    if before is not None:
        q = q.where(Post.id < before)
    rows = list(db.scalars(q.order_by(Post.id.desc()).limit(limit + 1)))
    more = len(rows) > limit
    rows = rows[:limit]
    return {
        "items": _views(db, v, rows),
        "next_cursor": rows[-1].id if more and rows else None,
    }


def _views(db: Session, v: Viewer, posts: list[Post]) -> list[dict]:
    if not posts:
        return []
    ids = [p.id for p in posts]
    counts: dict[int, dict[str, int]] = {i: {k: 0 for k in REACTIONS} for i in ids}
    for pid, kind, n in db.execute(
        select(Reaction.post_id, Reaction.kind, func.count())
        .where(Reaction.post_id.in_(ids))
        .group_by(Reaction.post_id, Reaction.kind)
    ):
        counts[pid][kind] = n
    mine: dict[int, list[str]] = {i: [] for i in ids}
    if v.role == "child":
        for pid, kind in db.execute(
            select(Reaction.post_id, Reaction.kind).where(
                Reaction.post_id.in_(ids), Reaction.child_id == v.id
            )
        ):
            mine[pid].append(kind)
    ncom = dict(
        db.execute(
            select(Comment.post_id, func.count())
            .where(Comment.post_id.in_(ids), Comment.status == "published")
            .group_by(Comment.post_id)
        ).all()
    )
    nicks = dict(
        db.execute(select(Child.id, Child.nick).where(Child.id.in_({p.child_id for p in posts}))).all()
    )
    tpl = dict(
        db.execute(
            select(Work.id, Work.template_id).where(Work.id.in_({p.work_id for p in posts}))
        ).all()
    )
    # ремикс: «ремикс работы @ник» — ник автора исходного поста, id поста нужен фронту для ссылки
    origin = dict(
        db.execute(
            select(Work.id, Work.remix_of_post_id).where(
                Work.id.in_({p.work_id for p in posts}), Work.remix_of_post_id.is_not(None)
            )
        ).all()
    )
    # ник исходного автора видит только тот, кто видит сам исходный пост (иначе ремикс выдал бы ник)
    origin_nick = {}
    for op in db.scalars(select(Post).where(Post.id.in_(set(origin.values())))):
        if service.access(db, v, op) is not None:
            origin_nick[op.id] = db.scalar(select(Child.nick).where(Child.id == op.child_id))
    # сказка: обложка поста = работа kind="page"; книжку читателю отдаём только готовую
    stories = {
        s.cover_work_id: s
        for s in db.scalars(
            select(Story).where(
                Story.cover_work_id.in_({p.work_id for p in posts}), Story.status == "ready"
            )
        )
    }
    my_class = service.class_of(db, v.id) if v.role == "child" else None
    urgent = _urgent_targets(db, "post", ids)
    out = []
    for p in posts:
        is_author = v.role == "child" and v.id == p.child_id
        out.append(
            {
                "id": p.id,
                "nick": nicks.get(p.child_id, ""),
                "caption": p.caption,
                "image_url": f"/api/posts/{p.id}/image",
                "template_id": tpl.get(p.work_id),
                "work_kind": p.work_kind,
                "remix_of": (
                    {"post_id": origin[p.work_id], "nick": origin_nick[origin[p.work_id]]}
                    if origin.get(p.work_id) in origin_nick
                    else None
                ),
                "story": (
                    {
                        "id": stories[p.work_id].id,
                        "title": stories[p.work_id].title,
                        "pages": [{"text": pg["text"]} for pg in stories[p.work_id].pages],
                    }
                    if p.work_id in stories
                    else None
                ),
                "remix_allowed": p.remix_allowed,
                "can_remix": v.role == "child"
                and not is_author
                and my_class is not None
                and p.class_id == my_class
                and open_for_remix(p),
                "audience": p.audience,
                "status": p.status,
                # самоповреждение: ребёнку нельзя показывать «ждёт взрослого», только тёплый ответ
                "support": is_author and p.id in urgent,
                "best": p.best,
                "reactions": counts[p.id],
                "mine": mine[p.id],
                "comments": ncom.get(p.id, 0),
                "is_author": is_author,
                "can_react": v.role == "child" and p.status == "published",
                "can_comment": v.role == "child" and p.status == "published" and not p.best,
                "can_delete": is_author or v.role in ("parent", "teacher"),
                "created_at": p.created_at.isoformat(),
            }
        )
    return out


Before = Annotated[int | None, Query(ge=1)]
Limit = Annotated[int, Query(ge=1, le=50)]


@router.get("/feed/class")
def feed_class(db: Db, v: V, before: Before = None, limit: Limit = 20, class_id: int | None = None):
    if v.role == "child":
        cid = service.class_of(db, v.id)
        if cid is None:
            return {"items": [], "next_cursor": None}
    elif v.role == "teacher":
        if class_id is None or not service.teacher_owns(db, v.id, class_id):
            raise HTTPException(404, "not_found")
        cid = class_id
    else:
        raise HTTPException(403, "forbidden")
    q = select(Post).where(Post.audience == "class", Post.class_id == cid)
    return _page(db, v, q, before, limit)


@router.get("/feed/family")
def feed_family(db: Db, v: V, before: Before = None, limit: Limit = 20):
    if v.role == "child":
        pid = v.obj.parent_id  # type: ignore[union-attr]
    elif v.role == "parent":
        pid = v.id
    else:
        raise HTTPException(403, "forbidden")
    if pid is None:
        return {"items": [], "next_cursor": None}
    q = select(Post).where(
        Post.audience == "family",
        Post.child_id.in_(select(Child.id).where(Child.parent_id == pid)),
    )
    return _page(db, v, q, before, limit)


@router.get("/feed/best")
def feed_best(db: Db, v: Guest, before: Before = None, limit: Limit = 20):
    return _page(db, v, select(Post).where(Post.best.is_(True)), before, limit)


# ---------------- пост ----------------


@router.get("/posts/{post_id}")
def get_post(post_id: int, db: Db, v: Guest):
    p, _ = _get_post(db, v, post_id)
    return _views(db, v, [p])[0]


@router.get("/posts/{post_id}/image")
def post_image(post_id: int, request: Request, db: Db, v: Guest, thumb: bool = False):
    p, _ = _get_post(db, v, post_id)
    w = db.get(Work, p.work_id)
    if w is None or not w.file_path or not Path(w.file_path).is_file():
        raise HTTPException(404, "not_found")
    if thumb:
        return thumb_response(w.file_path, request)
    return FileResponse(w.file_path, media_type="image/webp", headers={"Cache-Control": "private"})


@router.get("/posts/{post_id}/story/{n}")
def post_story_page(post_id: int, n: int, request: Request, db: Db, v: Guest, thumb: bool = False):
    """Страница сказки читателю: доступ как к самому посту, готовая сказка, страница прошла проверку."""
    p, _ = _get_post(db, v, post_id)
    s = db.scalar(select(Story).where(Story.cover_work_id == p.work_id, Story.status == "ready"))
    page = s.pages[n - 1] if s is not None and 1 <= n <= len(s.pages) else None
    if page is None or not page["ok"] or not page["file"] or not Path(page["file"]).is_file():
        raise HTTPException(404, "not_found")
    if thumb:
        return thumb_response(page["file"], request)
    return FileResponse(page["file"], media_type="image/webp", headers={"Cache-Control": "private"})


@router.delete("/posts/{post_id}")
def delete_post(post_id: int, db: Db, v: V):
    """Автор — deleted; учитель класса и родитель автора — hidden."""
    p, _ = _get_post(db, v, post_id)
    is_author = v.role == "child" and v.id == p.child_id
    if v.role == "child" and not is_author:
        raise HTTPException(403, "forbidden")
    if p.best and not is_author:
        raise HTTPException(403, "forbidden")  # из «Лучшего» чужой пост взрослый не скрывает
    new = "deleted" if is_author else "hidden"
    db.execute(update(Post).where(Post.id == p.id).values(status=new))
    if new == "hidden":  # взрослый скрыл исходник: ремиксы с него тоже скрыты, одной транзакцией
        hide_remixes(db, p.id)
    db.commit()
    return {"id": p.id, "status": new}


# ---------------- реакции (ставят только дети; учитель и родитель читают) ----------------


def _reaction_state(db: Session, c: Child, p: Post) -> dict:
    row = _views(db, Viewer("child", c), [p])[0]
    return {"reactions": row["reactions"], "mine": row["mine"]}


def _react_target(db: Session, c: Child, post_id: int, kind: str) -> Post:
    if kind not in REACTIONS:
        raise HTTPException(422, "bad_reaction")
    p, _ = _get_post(db, Viewer("child", c), post_id)
    if p.status != "published":
        raise HTTPException(409, "not_published")
    return p


@router.put("/posts/{post_id}/reactions/{kind}")
def add_reaction(post_id: int, kind: str, c: AdultChild, db: Db):
    p = _react_target(db, c, post_id, kind)
    if not db.scalar(
        select(Reaction.id).where(
            Reaction.post_id == p.id, Reaction.child_id == c.id, Reaction.kind == kind
        )
    ):
        db.add(Reaction(post_id=p.id, child_id=c.id, kind=kind))
        try:
            db.commit()
        except IntegrityError:  # гонка двойного клика: реакция уже есть
            db.rollback()
    return _reaction_state(db, c, p)


@router.delete("/posts/{post_id}/reactions/{kind}")
def remove_reaction(post_id: int, kind: str, c: AdultChild, db: Db):
    p = _react_target(db, c, post_id, kind)
    db.execute(
        delete(Reaction).where(
            Reaction.post_id == p.id, Reaction.child_id == c.id, Reaction.kind == kind
        )
    )
    db.commit()
    return _reaction_state(db, c, p)


# ---------------- комментарии (#8) ----------------


@router.get("/posts/{post_id}/comments")
def list_comments(post_id: int, db: Db, v: V):
    p, _ = _get_post(db, v, post_id)
    if p.best:
        raise HTTPException(403, "comments_closed")
    if p.status != "published":
        return []
    q = (
        select(Comment, Child.nick)
        .join(Child, Child.id == Comment.child_id)
        .where(Comment.post_id == p.id)
    )
    if v.role == "child":  # свой задержанный комментарий автор видит с пометкой, чужие — нет
        q = q.where(
            (Comment.status == "published")
            | ((Comment.child_id == v.id) & (Comment.status == "held"))
        )
    else:
        q = q.where(Comment.status == "published")
    rows = db.execute(q.order_by(Comment.id).limit(200)).all()
    urgent = _urgent_targets(db, "comment", [cm.id for cm, _ in rows])
    return [
        {
            "id": cm.id,
            "nick": nick,
            "text": cm.text,
            "status": cm.status,
            "mine": v.role == "child" and cm.child_id == v.id,
            "support": v.role == "child" and cm.child_id == v.id and cm.id in urgent,
            "created_at": cm.created_at.isoformat(),
        }
        for cm, nick in rows
    ]


@router.post("/posts/{post_id}/comments")
def add_comment(
    post_id: int, body: NewComment, c: AdultChild, db: Db
):
    p, _ = _get_post(db, Viewer("child", c), post_id)
    if p.best:
        raise HTTPException(403, "comments_closed")
    if p.status != "published":
        raise HTTPException(409, "not_published")
    text = body.text.strip()
    if not text:
        raise HTTPException(422, "empty")
    d = service.judge(text, "comment", c.lang)
    if d is not None and d.action == "allow":
        cm = Comment(post_id=p.id, child_id=c.id, text=text, status="published")
        db.add(cm)
        db.commit()
        return {"status": "published", "id": cm.id}
    kinder = (getattr(d, "safe_text", None) or "").strip() if d is not None else ""
    if (
        d is not None
        and d.action == "kinder"
        and kinder
        and kinder.casefold() != text.casefold()  # грубый оригинал не предлагаем и не публикуем
    ):
        s = CommentSuggestion(post_id=p.id, child_id=c.id, kinder_text=kinder)
        db.add(s)
        db.commit()
        return {"status": "suggest", "kinder": kinder, "suggestion_id": s.id}
    cm = Comment(post_id=p.id, child_id=c.id, text=text, status="held")
    db.add(cm)
    db.flush()
    support = service.hold_for(
        db, item_type="comment", target_id=cm.id, child_id=c.id, post=p, d=d, text=text
    )
    db.commit()
    return {"status": "support" if support else "held", "id": cm.id}


def _own_suggestion(db: Session, c: Child, sid: int) -> CommentSuggestion:
    s = db.get(CommentSuggestion, sid)
    if s is None or s.child_id != c.id:
        raise HTTPException(404, "not_found")
    return s


@router.post("/comments/suggestions/{sid}/accept")
def accept_suggestion(sid: int, c: AdultChild, db: Db):
    """Публикуется только добрая версия, уже прошедшая проверку. Атомарно: один раз."""
    s = _own_suggestion(db, c, sid)
    p, _ = _get_post(db, Viewer("child", c), s.post_id)
    if p.best or p.status != "published":
        raise HTTPException(409, "not_published")
    res = db.execute(
        update(CommentSuggestion)
        .where(CommentSuggestion.id == sid, CommentSuggestion.status == "open")
        .values(status="accepted")
    )
    if res.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "already_decided")
    cm = Comment(post_id=p.id, child_id=c.id, text=s.kinder_text, status="published")
    db.add(cm)
    db.commit()
    return {"status": "published", "id": cm.id}


@router.post("/comments/suggestions/{sid}/cancel")
def cancel_suggestion(sid: int, c: AdultChild, db: Db):
    _own_suggestion(db, c, sid)
    db.execute(
        update(CommentSuggestion)
        .where(CommentSuggestion.id == sid, CommentSuggestion.status == "open")
        .values(status="cancelled")
    )
    db.commit()
    return {"status": "cancelled"}
