"""«Поделиться со всеми»: без разрешения взрослого ничего не открывается, отказ сильнее просьбы, данных ребёнка наружу нет."""

import io
import os

os.environ.setdefault("SESSION_SECRET", "test-session-secret-0123456789abcdef")

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app import db
from app.accounts import nickcheck
from app.config import get_settings
from app.main import app
from app.moderation import HeldItem
from app.works.image.models import Work
from app.works.share.models import Share

PICS = [3, 7, 1]


class Allow:
    action, safe_text, urgent, categories, reason_codes = "allow", None, False, [], []


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "_engine", None)
    monkeypatch.setattr(db, "_session_factory", None)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/t.db")
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "up"))
    get_settings.cache_clear()
    monkeypatch.setattr(nickcheck, "_check_text", lambda: lambda *a, **k: Allow())
    yield
    if db._engine is not None:
        db._engine.dispose()
    get_settings.cache_clear()


@pytest.fixture
def world(tmp_path):
    parent = TestClient(app)
    parent.__enter__()
    parent.post("/api/parent/register", json={"email": "p@x.io", "password": "correct-horse-1"})
    cid = parent.post("/api/parent/children", json={"nick": "SecretNick", "age_group": "5-8", "lang": "ru", "pictures": PICS}).json()["id"]
    kid = TestClient(app)
    assert kid.post("/api/child/login", json={"nick": "SecretNick", "pictures": PICS}).status_code == 200
    yield parent, kid, cid, tmp_path
    parent.__exit__(None, None, None)


def make_work(cid, tmp_path, kind="image", status="ready", name="w"):
    f = tmp_path / f"{name}.webp"
    Image.new("RGB", (64, 64), "red").save(f, "WEBP")
    with db.new_session() as s:
        w = Work(child_id=cid, kind=kind, template_id="clay", status=status, file_path=str(f), request_id=f"r-{name}", child_text="секретный запрос")
        s.add(w)
        s.commit()
        return w.id


def token_of(wid):
    with db.new_session() as s:
        return s.scalar(select(Share.token).where(Share.work_id == wid))


def item_of(wid):
    with db.new_session() as s:
        sid = s.scalar(select(Share.id).where(Share.work_id == wid))
        return s.scalar(select(HeldItem.id).where(HeldItem.item_type == "share", HeldItem.target_id == str(sid)).order_by(HeldItem.id.desc()))


def test_nothing_opens_until_adult_approves(world):
    parent, kid, cid, tmp = world
    wid = make_work(cid, tmp)
    assert kid.post(f"/api/works/{wid}/share").json() == {"status": "waiting", "path": None}
    guest = TestClient(app)
    token = token_of(wid)
    assert guest.get(f"/api/public/{token}").status_code == 404
    assert guest.get(f"/api/public/{token}/card.jpg").status_code == 404
    assert guest.get(f"/s/{token}").status_code == 404
    assert parent.post(f"/api/review/items/{item_of(wid)}/approve").status_code == 200
    view = kid.get(f"/api/works/{wid}/share").json()
    assert view == {"status": "live", "path": f"/s/{token}"}
    # открытая часть без данных ребёнка, картинка настоящая
    page = guest.get(view["path"])
    assert page.status_code == 200 and f"/api/public/{token}/card.jpg" in page.text and 'og:image' in page.text
    assert "SecretNick" not in page.text and "секретный" not in page.text
    assert "noindex" in page.headers["x-robots-tag"]
    pub = guest.get(f"/api/public/{token}").json()
    assert set(pub) == {"image_url"}
    card = guest.get(pub["image_url"])
    assert card.headers["content-type"] == "image/jpeg" and Image.open(io.BytesIO(card.content)).format == "JPEG"
    # и в общей ленте
    # и в общей ленте, но ника там нет ни у гостя, ни у другого ребёнка; автор свой ник видит
    items = guest.get("/api/feed/best").json()["items"]
    assert len(items) == 1 and items[0]["nick"] == ""
    assert "SecretNick" not in guest.get("/api/feed/best").text
    assert guest.get(f"/api/posts/{items[0]['id']}").json()["nick"] == ""
    assert kid.get("/api/feed/best").json()["items"][0]["nick"] == "SecretNick"


def test_refusal_is_stronger_than_asking_again(world):
    parent, kid, cid, tmp = world
    wid = make_work(cid, tmp)
    kid.post(f"/api/works/{wid}/share")
    assert parent.post(f"/api/review/items/{item_of(wid)}/reject").status_code == 200
    assert kid.post(f"/api/works/{wid}/share").json() == {"status": "refused", "path": None}
    assert TestClient(app).get(f"/s/{token_of(wid)}").status_code == 404
    assert TestClient(app).get("/api/feed/best").json()["items"] == []


def test_adult_stop_kills_link_for_good(world):
    parent, kid, cid, tmp = world
    wid = make_work(cid, tmp)
    kid.post(f"/api/works/{wid}/share")
    parent.post(f"/api/review/items/{item_of(wid)}/approve")
    token = token_of(wid)
    assert parent.delete(f"/api/works/{wid}/share").json()["status"] == "refused"
    assert TestClient(app).get(f"/s/{token}").status_code == 404
    assert TestClient(app).get("/api/feed/best").json()["items"] == []
    assert kid.post(f"/api/works/{wid}/share").json()["status"] == "refused"


def test_child_stop_then_new_link_needs_adult_again(world):
    parent, kid, cid, tmp = world
    wid = make_work(cid, tmp)
    kid.post(f"/api/works/{wid}/share")
    parent.post(f"/api/review/items/{item_of(wid)}/approve")
    old = token_of(wid)
    assert kid.delete(f"/api/works/{wid}/share").json()["status"] == "off"
    assert TestClient(app).get(f"/s/{old}").status_code == 404
    assert kid.post(f"/api/works/{wid}/share").json() == {"status": "waiting", "path": None}
    assert token_of(wid) != old
    assert TestClient(app).get(f"/s/{token_of(wid)}").status_code == 404


def test_link_dies_when_work_is_taken_down(world):
    parent, kid, cid, tmp = world
    wid = make_work(cid, tmp)
    kid.post(f"/api/works/{wid}/share")
    parent.post(f"/api/review/items/{item_of(wid)}/approve")
    with db.new_session() as s:
        s.get(Work, wid).status = "refused"
        s.commit()
    assert TestClient(app).get(f"/s/{token_of(wid)}").status_code == 404
    assert kid.get(f"/api/works/{wid}/share").json()["path"] is None


def test_upload_and_foreign_work_cannot_be_shared(world):
    parent, kid, cid, tmp = world
    upload = make_work(cid, tmp, kind="upload", name="u")
    assert kid.post(f"/api/works/{upload}/share").status_code == 409
    other = make_work(cid, tmp, name="o")
    parent.post("/api/parent/children", json={"nick": "OtherKid", "age_group": "5-8", "lang": "ru", "pictures": PICS})
    stranger = TestClient(app)
    assert stranger.post("/api/child/login", json={"nick": "OtherKid", "pictures": PICS}).status_code == 200
    assert stranger.post(f"/api/works/{other}/share").status_code == 404
    assert stranger.get(f"/api/works/{other}/share").status_code == 404


def test_parent_sees_open_links_and_level_count(world):
    parent, kid, cid, tmp = world
    wid = make_work(cid, tmp)
    make_work(cid, tmp, kind="upload", name="u")
    assert parent.get("/api/parent/shares").json() == []
    kid.post(f"/api/works/{wid}/share")
    assert parent.get("/api/parent/shares").json() == []  # пока ждёт, открытой ссылки нет
    parent.post(f"/api/review/items/{item_of(wid)}/approve")
    rows = parent.get("/api/parent/shares").json()
    assert [r["work_id"] for r in rows] == [wid] and rows[0]["nick"] == "SecretNick"
    parent.delete(f"/api/works/{wid}/share")
    assert parent.get("/api/parent/shares").json() == []
    assert parent.get(f"/api/parent/children/{cid}/analytics").json()["pictures_total"] == 1  # загрузка не в счёт
    other = TestClient(app)
    other.post("/api/parent/register", json={"email": "q@x.io", "password": "correct-horse-1"})
    kid.post(f"/api/works/{wid}/share")
    assert other.get("/api/parent/shares").json() == []
