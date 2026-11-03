"""Аватар: выбирается из списка, один адрес для всех экранов, без выбора зверёк как на фронте."""

import os

os.environ.setdefault("SESSION_SECRET", "test-session-secret-0123456789abcdef")

import pytest
from fastapi.testclient import TestClient

from app import db
from app.accounts import nickcheck
from app.accounts.router import animal_for
from app.config import get_settings
from app.main import app

PICS = [3, 7, 1]
NICKS = {"StarFox":"fox","Bunny":"bunny","Lumi":"dino","Zuzu":"owl","TikTak":"fox","SunnyBee":"panda","Мила":"bunny","LimeLion":"lion","CatOwl":"cat","OwlCat":"owl"}


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


def where(c, nick):
    r = c.get(f"/api/avatars/{nick}", follow_redirects=False)
    assert r.status_code == 302
    return r.headers["location"]


def test_choice_at_creation_and_child_can_change_it():
    with TestClient(app) as parent:
        parent.post("/api/parent/register", json={"email": "p@x.io", "password": "correct-horse-1"})
        made = parent.post("/api/parent/children", json={"nick": "StarFox", "age_group": "5-8", "lang": "ru", "pictures": PICS, "avatar": "panda"})
        assert made.status_code == 201
        assert where(parent, "StarFox") == "/art/avatars/panda.webp"  # выбор сильнее слова в нике
        kid = TestClient(app)
        assert kid.post("/api/child/login", json={"nick": "StarFox", "pictures": PICS}).status_code == 200
        assert kid.post("/api/child/avatar", json={"avatar": "owl"}).status_code == 200
        assert where(kid, "starfox") == "/art/avatars/owl.webp"
        assert kid.post("/api/child/avatar", json={"avatar": "../../evil"}).status_code == 422
        assert TestClient(app).post("/api/child/avatar", json={"avatar": "owl"}).status_code == 401


def test_without_choice_same_animal_as_frontend():
    # Значения посчитаны на фронте функцией animalFor: сервер и браузер не должны расходиться
    with TestClient(app) as c:
        for nick, animal in NICKS.items():
            assert animal_for(nick) == animal, nick
        assert where(c, "НетТакого") == f"/art/avatars/{animal_for('НетТакого')}.webp"
