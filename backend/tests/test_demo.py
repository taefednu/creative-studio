"""Вход для жюри: на обычном стенде ручки нет, это был бы обход пароля."""

import os

os.environ.setdefault("SESSION_SECRET", "test-session-secret-0123456789abcdef")

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import db
from app.config import get_settings
from app.main import app

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import seed_demo


@pytest.fixture
def seeded(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "_engine", None)
    monkeypatch.setattr(db, "_session_factory", None)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/t.db")
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "up"))
    get_settings.cache_clear()
    imgs = tmp_path / "img"
    imgs.mkdir()
    Image.new("RGB", (64, 64), "tomato").save(imgs / "a.webp", "WEBP")
    seed_demo.seed(imgs)
    yield monkeypatch
    db._engine.dispose()
    get_settings.cache_clear()


def test_off_by_default_no_bypass(seeded):
    c = TestClient(app)
    assert c.get("/api/demo").json() == {"enabled": False}
    for role in ("child", "parent", "teacher"):
        assert c.post("/api/demo/login", json={"role": role}).status_code == 404
    assert c.get("/api/child/me").status_code == 401


def test_on_logs_in_and_tops_up(seeded):
    seeded.setenv("DEMO_LOGIN", "true")
    get_settings.cache_clear()
    c = TestClient(app)
    assert c.post("/api/demo/login", json={"role": "child"}).json()["role"] == "child"
    me = c.get("/api/child/me").json()
    assert me["nick"] == "StarFox" and me["coins"] >= 20
    assert c.post("/api/demo/login", json={"role": "admin"}).status_code == 422
    assert TestClient(app).post("/api/demo/login", json={"role": "teacher"}).status_code == 200
