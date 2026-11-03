"""«Поделиться со всеми»: ребёнок просит, взрослый разрешает, работа уходит в общую ленту и получает ссылку.

На странице по ссылке только проверенная картинка: ни ника, ни подписи, ни текста запроса. Загрузка и ремикс
не делятся: в загрузке может быть настоящее фото, ремикс — работа одноклассника.
"""

import io
import re
import secrets
from html import escape
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.adults import AdultChild
from app.accounts.deps import current_child, current_parent, current_teacher
from app.accounts.models import Child, ClassMembership, Classroom, Parent, Teacher
from app.db import get_session
from app.feed.models import Post
from app.feed.router import V, _origin_chain
from app.feed.service import class_of
from app.moderation import HeldItem, hold, register
from app.works.image.models import Work
from app.works.share.models import Share

router = APIRouter()
Db = Annotated[Session, Depends(get_session)]

SHAREABLE = ("image", "alive")
OG = {
    "ru": ("Смотри, что я создал!", "Картинка проверена ИИ. Создай свою в Mentorium Creative Studio."),
    "en": ("Look what I made!", "Checked by AI. Make your own in Mentorium Creative Studio."),
    "uz": ("Qara, nima yaratdim!", "Rasm AI tomonidan tekshirilgan. O‘zingnikini Mentorium Creative Studio’da yarat."),
}


def _chain_ready(db: Session, w: Work) -> bool:
    return all(x.status == "ready" for x in _origin_chain(db, w))


def _live_work(db: Session, token: str) -> tuple[Share, Work] | None:
    """Ссылка работает, только пока всё разрешено сейчас: отказ взрослого по любому звену гасит её сразу."""
    s = db.scalar(select(Share).where(Share.token == token))
    if s is None or s.status != "live" or s.post_id is None:
        return None
    p = db.get(Post, s.post_id)
    w = db.get(Work, s.work_id)
    if p is None or p.status != "published" or w is None or w.status != "ready" or not _chain_ready(db, w):
        return None
    if not w.file_path or not Path(w.file_path).is_file():
        return None
    return s, w


def _view(db: Session, s: Share | None) -> dict:
    if s is None:
        return {"status": "none", "path": None}
    live = s.status == "live" and _live_work(db, s.token) is not None
    status = "off" if s.status == "live" and not live else s.status
    return {"status": status, "path": f"/s/{s.token}" if live else None}


def _own(db: Session, work_id: int, c: Child) -> Work:
    w = db.get(Work, work_id)
    if w is None or w.child_id != c.id:
        raise HTTPException(404, "not_found")
    return w


@router.get("/api/works/{work_id}/share")
def get_share(work_id: int, c: Annotated[Child, Depends(current_child)], db: Db):
    _own(db, work_id, c)
    return _view(db, db.scalar(select(Share).where(Share.work_id == work_id)))


@router.post("/api/works/{work_id}/share")
def ask_share(work_id: int, c: AdultChild, db: Db):
    w = _own(db, work_id, c)
    if w.status != "ready" or not _chain_ready(db, w):
        raise HTTPException(409, "work_not_ready")
    if w.kind not in SHAREABLE or any(x.remix_of_post_id is not None for x in _origin_chain(db, w)):
        raise HTTPException(409, "not_shareable")
    s = db.scalar(select(Share).where(Share.work_id == work_id))
    if s is not None and s.status in ("waiting", "live", "refused"):
        return _view(db, s)  # двойной клик; отказ взрослого сильнее повторной просьбы
    if s is None:
        s = Share(work_id=work_id, child_id=c.id, token=secrets.token_urlsafe(24))
        db.add(s)
    else:  # ребёнок сам выключал: новая просьба, новый адрес, снова через взрослого
        s.status, s.token, s.post_id = "waiting", secrets.token_urlsafe(24), None
    db.flush()
    cls = None if c.parent_id else class_of(db, c.id)
    hold(
        db,
        item_type="share",
        target_id=s.id,
        child_id=c.id,
        reviewer="parent" if c.parent_id else "teacher",
        reason_codes=["share_request"],
        class_id=cls,
        commit=False,
    )
    db.commit()
    return _view(db, s)


@router.delete("/api/works/{work_id}/share")
def stop_share(work_id: int, db: Db, v: V):
    """Выключает ребёнок-автор или его взрослый. После взрослого ссылку снова не включить."""
    s = db.scalar(select(Share).where(Share.work_id == work_id))
    author = db.get(Child, s.child_id) if s is not None else None
    if s is None or author is None:
        raise HTTPException(404, "not_found")
    is_author = v.role == "child" and v.id == author.id
    is_parent = v.role == "parent" and v.id == author.parent_id
    is_teacher = False
    if v.role == "teacher":
        cid = class_of(db, author.id)
        room = db.get(Classroom, cid) if cid is not None else None
        is_teacher = room is not None and room.teacher_id == v.id
    if not (is_author or is_parent or is_teacher):
        raise HTTPException(404, "not_found")
    if s.post_id is not None:
        p = db.get(Post, s.post_id)
        if p is not None and p.status == "published":
            p.status = "deleted" if is_author else "hidden"
    s.status = "off" if is_author else "refused"
    s.post_id = None
    db.commit()
    return _view(db, s)


def _links(db: Session, rows) -> list[dict]:
    return [
        {"work_id": s.work_id, "nick": nick, "path": f"/s/{s.token}", "image_url": f"/api/public/{s.token}/card.jpg"}
        for s, nick in rows
        if _live_work(db, s.token) is not None
    ]


@router.get("/api/parent/shares")
def parent_shares(p: Annotated[Parent, Depends(current_parent)], db: Db):
    """Какие работы детей этого родителя сейчас открыты всем: чтобы было что выключить."""
    rows = db.execute(
        select(Share, Child.nick).join(Child, Child.id == Share.child_id).where(Child.parent_id == p.id, Share.status == "live")
    ).all()
    return _links(db, rows)


@router.get("/api/teacher/shares")
def teacher_shares(t: Annotated[Teacher, Depends(current_teacher)], db: Db):
    """То же для учителя: работы детей его классов."""
    rows = db.execute(
        select(Share, Child.nick)
        .join(Child, Child.id == Share.child_id)
        .join(ClassMembership, ClassMembership.child_id == Child.id)
        .join(Classroom, Classroom.id == ClassMembership.class_id)
        .where(Classroom.teacher_id == t.id, Share.status == "live")
    ).all()
    return _links(db, rows)


# ---- решение взрослого ----


def _approve(db: Session, item: HeldItem) -> None:
    s = db.get(Share, int(item.target_id))
    w = db.get(Work, s.work_id) if s is not None else None
    if s is None or w is None or s.status != "waiting":
        return
    if w.status != "ready" or not _chain_ready(db, w):  # пока ждали, работу сняли
        s.status = "refused"
        db.commit()
        return
    post = Post(work_id=w.id, work_kind=w.kind, child_id=s.child_id, audience="public", status="published", best=True)
    db.add(post)
    db.flush()
    s.status, s.post_id = "live", post.id
    db.commit()


def _reject(db: Session, item: HeldItem) -> None:
    s = db.get(Share, int(item.target_id))
    if s is not None and s.status == "waiting":
        s.status = "refused"
        db.commit()


register("share", _approve, _reject)


# ---- открытая часть: без входа, без данных ребёнка ----


@router.get("/api/public/{token}")
def public_work(token: str, db: Db, response: Response):
    if _live_work(db, token) is None:
        raise HTTPException(404, "not_found")
    response.headers["X-Robots-Tag"] = "noindex"
    return {"image_url": f"/api/public/{token}/card.jpg"}


@router.get("/api/public/{token}/card.jpg")
def public_card(token: str, db: Db):
    """JPEG: превью в мессенджерах надёжно понимают его. Кэш короткий: выключенная ссылка гаснет быстро."""
    live = _live_work(db, token)
    if live is None:
        raise HTTPException(404, "not_found")
    im = Image.open(live[1].file_path).convert("RGB")
    im.thumbnail((1200, 1200))
    out = io.BytesIO()
    im.save(out, "JPEG", quality=88)
    return Response(out.getvalue(), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex"})


def _page(request: Request, static_dir: str | None, tags: str) -> str:
    index = Path(static_dir or "") / "index.html"
    html = index.read_text(encoding="utf-8") if static_dir and index.is_file() else "<!doctype html><html><head></head><body></body></html>"
    html = re.sub(r'\s*<meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*>', "", html)
    return html.replace("</head>", f"{tags}</head>", 1)


@router.get("/s/{token}", include_in_schema=False)
def share_page(token: str, request: Request, db: Db):
    """Страница для людей и для ботов мессенджеров: те читают теги, браузер дальше рисует приложение."""
    import os

    static_dir = os.environ.get("STATIC_DIR")
    live = _live_work(db, token)
    base = f"{request.headers.get('x-forwarded-proto', request.url.scheme)}://{request.headers.get('host', request.url.netloc)}"
    robots = '<meta name="robots" content="noindex" />'
    if live is None:
        return HTMLResponse(_page(request, static_dir, robots), status_code=404, headers={"X-Robots-Tag": "noindex"})
    child = db.get(Child, live[0].child_id)
    title, text = OG.get(child.lang if child else "ru", OG["ru"])
    image = f"{base}/api/public/{token}/card.jpg"
    tags = (
        f'{robots}<meta property="og:type" content="website" />'
        f'<meta property="og:site_name" content="Mentorium Creative Studio" />'
        f'<meta property="og:title" content="{escape(title)}" />'
        f'<meta property="og:description" content="{escape(text)}" />'
        f'<meta property="og:url" content="{escape(f"{base}/s/{token}")}" />'
        f'<meta property="og:image" content="{escape(image)}" />'
        f'<meta name="twitter:card" content="summary_large_image" />'
        f'<meta name="twitter:image" content="{escape(image)}" />'
    )
    return HTMLResponse(_page(request, static_dir, tags), headers={"X-Robots-Tag": "noindex"})
