"""Демо-наполнение (scripts/seed_demo.py): очереди, лента, аналитика, оригинал загрузки закрыт ребёнку."""

import io
import os
import sys
from pathlib import Path

os.environ.setdefault("SESSION_SECRET", "test-session-secret-0123456789abcdef")

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import db
from app.config import get_settings
from app.feed.models import Post
from app.main import app
from app.works.image.models import Work

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import seed_demo


@pytest.fixture
def seeded(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "_engine", None)
    monkeypatch.setattr(db, "_session_factory", None)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/t.db")
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "up"))
    get_settings.cache_clear()
    imgs = tmp_path / "img"  # заглушки вместо сети: без манифеста берутся все *.webp
    imgs.mkdir()
    for n, col in (("a", "tomato"), ("b", "skyblue")):
        Image.new("RGB", (64, 64), col).save(imgs / f"{n}.webp", "WEBP")
    out = seed_demo.seed(imgs)
    yield out, imgs
    db._engine.dispose()
    get_settings.cache_clear()


def _login(role_path, body):
    c = TestClient(app)
    assert c.post(role_path, json=body).status_code == 200
    return c


def test_seed_queues_feed_analytics(seeded):
    out, _ = seeded
    pw = out["adult_password"]
    teacher = _login("/api/teacher/login", {"email": out["teacher"]["email"], "password": pw})
    q = teacher.get("/api/review/queue").json()
    assert len(q) == 5
    urgent = [i for i in q if i["urgent"]]
    assert len(urgent) == 1 and urgent[0]["preview_text"] is None

    kid = _login("/api/child/login", {"nick": "StarFox", "pictures": out["child_pictures"]})
    posts = kid.get("/api/feed/class").json()["items"]
    assert len(posts) >= 20 and all(p["status"] == "published" for p in posts)
    assert kid.get(f"/api/posts/{posts[0]['id']}/image").status_code == 200
    up = out["upload_item"]
    assert kid.get(f"/api/review/items/{up}/image?version=original").status_code in (401, 403, 404)

    # проверяющий оригинал видит
    assert teacher.get(f"/api/review/items/{up}/image?version=original").status_code == 200

    parent = _login("/api/parent/login", {"email": out["parent"]["email"], "password": pw})
    assert len(parent.get("/api/review/queue").json()) >= 2
    a = parent.get(f"/api/parent/children/{out['children']['StarFox']}/analytics").json()
    assert a["has_data"] is True


def test_seed_refuses_nonempty_db_and_no_images(seeded, tmp_path):
    _out, imgs = seeded
    with pytest.raises(SystemExit):
        seed_demo.seed(imgs)  # родители и учителя уже есть
    empty = tmp_path / "none"
    empty.mkdir()
    with pytest.raises(SystemExit):
        seed_demo.seed(empty)


def test_feed_thumb_small_fresh_and_gated(seeded):
    out, _ = seeded
    kid = _login("/api/child/login", {"nick": "Lumi", "pictures": out["child_pictures"]})
    pid = kid.get("/api/feed/class").json()["items"][-1]["id"]
    s = db.new_session()
    path = s.get(Work, s.get(Post, pid).work_id).file_path
    s.close()
    Image.new("RGB", (1000, 1000), "red").save(path, "WEBP")
    r = kid.get(f"/api/posts/{pid}/image?thumb=1")
    assert r.status_code == 200 and Image.open(io.BytesIO(r.content)).width == 560
    assert Image.open(io.BytesIO(kid.get(f"/api/posts/{pid}/image").content)).width == 1000
    # файл перезаписан (размытие): старое превью отдавать нельзя
    Image.new("RGB", (1000, 1000), "blue").save(path, "WEBP")
    px = Image.open(io.BytesIO(kid.get(f"/api/posts/{pid}/image?thumb=1").content)).convert("RGB").getpixel((5, 5))
    assert px[2] > 200 and px[0] < 60
    # превью закрыто так же, как картинка: гость не видит пост класса
    assert TestClient(app).get(f"/api/posts/{pid}/image?thumb=1").status_code in (401, 403, 404)
    # повтор без скачивания, но с проверкой доступа: скрытый пост не отдаёт 304 из кэша браузера
    r = kid.get(f"/api/posts/{pid}/image?thumb=1")
    etag = {"If-None-Match": r.headers["etag"]}
    assert "no-cache" in r.headers["cache-control"]
    assert kid.get(f"/api/posts/{pid}/image?thumb=1", headers=etag).status_code == 304
    s = db.new_session()
    s.get(Post, pid).status = "hidden"
    s.commit()
    s.close()
    assert kid.get(f"/api/posts/{pid}/image?thumb=1", headers=etag).status_code == 404
