"""Тикет #4: вход, дети, классы, QR, монеты. Ловушки из traps.md и редакции 3."""

import os
from datetime import timedelta

os.environ.setdefault("SESSION_SECRET", "test-session-secret")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import clock, db
from app.accounts import nickcheck
from app.accounts.models import CoinLedger, ParentNotification
from app.config import get_settings
from app.main import app

PW = "correct-horse-1"
PICS = [3, 7, 1]
WRONG = [3, 7, 2]


class FakeCheck:
    """Подмена check_text из #2: action задаём в тесте; calls — что проверяли."""

    def __init__(self, action="allow", exc=None):
        self.action, self.exc, self.calls = action, exc, []

    def __call__(self, text, kind, lang, **kw):
        self.calls.append((text, kind, lang))
        if self.exc:
            raise self.exc
        return type("D", (), {"action": self.action})()


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "_engine", None)
    monkeypatch.setattr(db, "_session_factory", None)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/t.db")
    get_settings.cache_clear()
    yield
    if db._engine is not None:
        db._engine.dispose()
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def allow_nicks(monkeypatch):
    fake = FakeCheck()
    monkeypatch.setattr(nickcheck, "_check_text", lambda: fake)
    return fake


@pytest.fixture
def now(monkeypatch):
    t = [clock.now()]
    monkeypatch.setattr(clock, "now", lambda: t[0])
    return t


def new_client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def api():
    with new_client() as c:
        yield c


def parent(c, email="mom@example.com"):
    r = c.post("/api/parent/register", json={"email": email, "password": PW})
    assert r.status_code == 201, r.text
    return c


def add_child(c, nick="StarFox", pics=PICS):
    r = c.post(
        "/api/parent/children",
        json={"nick": nick, "age_group": "5-8", "lang": "ru", "pictures": pics},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def child_login(nick="StarFox", pics=PICS):
    c = new_client()
    r = c.post("/api/child/login", json={"nick": nick, "pictures": pics})
    return c, r


def teacher(c, email="t@example.com"):
    assert c.post("/api/teacher/register", json={"email": email, "password": PW}).status_code == 201
    return c


# ---------- хеши не утекают ----------


def test_no_hashes_or_secrets_in_any_response(api):
    texts = []
    r = api.post("/api/parent/register", json={"email": "mom@example.com", "password": PW})
    texts.append(r.text)
    cid = add_child(api)
    texts += [
        api.get("/api/parent/me").text,
        api.get("/api/parent/children").text,
        api.get("/api/parent/notifications").text,
        api.post(f"/api/parent/children/{cid}/qr").text,
    ]
    cc, r = child_login()
    texts += [r.text, cc.get("/api/child/me").text]
    t = teacher(new_client())
    texts += [t.post("/api/teacher/classes", json={"name": "5B"}).text, t.get("/api/teacher/me").text]
    blob = " ".join(texts).lower()
    for bad in ("scrypt", "hash", PW, "password", "pictures", "3,7,1", "locked_until"):
        assert bad not in blob, bad
    # в базе пароль и картинки тоже не лежат открытым текстом
    with next(db.get_session()) as s:
        from app.accounts.models import Child, Parent

        assert PW not in s.scalar(select(Parent.pw_hash))
        assert "3,7,1" not in s.scalar(select(Child.picture_password_hash))


# ---------- вход ребёнка ----------


def test_child_login_ok_and_balance_20(api):
    parent(api)
    add_child(api)
    cc, r = child_login()
    assert r.status_code == 200
    me = cc.get("/api/child/me").json()
    assert me["coins"] == 20 and me["has_parent"] is True and me["class"] is None
    assert me["nick"] == "StarFox"


def test_login_error_does_not_reveal_nick(api):
    parent(api)
    add_child(api)
    _, wrong = child_login(pics=WRONG)
    _, nobody = child_login(nick="Nobody", pics=PICS)
    assert wrong.status_code == nobody.status_code == 401
    assert wrong.json() == nobody.json()


def test_sixth_attempt_rejected_even_with_correct_pictures(api, now):
    parent(api)
    add_child(api)
    for _ in range(5):
        assert child_login(pics=WRONG)[1].status_code == 401
    assert child_login(pics=PICS)[1].status_code == 401  # 6-я, верная — отказ
    assert api.get("/api/parent/children").json()[0]["locked"] is True
    notes = api.get("/api/parent/notifications").json()
    assert [n["kind"] for n in notes] == ["login_locked"] and notes[0]["nick"] == "StarFox"
    now[0] += timedelta(minutes=15, seconds=1)
    assert child_login(pics=PICS)[1].status_code == 200  # замок снят временем


def test_lock_is_per_nick_not_per_address(api):
    parent(api)
    add_child(api, "StarFox")
    add_child(api, "MoonCat", [0, 1, 2])
    for _ in range(5):
        child_login("StarFox", WRONG)
    assert child_login("StarFox", PICS)[1].status_code == 401
    assert child_login("MoonCat", [0, 1, 2])[1].status_code == 200  # тот же адрес, другой ник


def test_success_resets_failed_counter(api):
    parent(api)
    add_child(api)
    for _ in range(4):
        child_login(pics=WRONG)
    assert child_login()[1].status_code == 200
    for _ in range(4):
        child_login(pics=WRONG)
    assert child_login()[1].status_code == 200  # 4+4 не складываются в 5


# ---------- QR ----------


def test_qr_single_use(api):
    parent(api)
    cid = add_child(api)
    tok = api.post(f"/api/parent/children/{cid}/qr").json()["token"]
    c1 = new_client()
    assert c1.get("/api/child/qr-login", params={"token": tok}).status_code == 200
    assert c1.get("/api/child/me").status_code == 200
    assert new_client().get("/api/child/qr-login", params={"token": tok}).status_code == 401


def test_qr_expires_after_5_minutes(api, now):
    parent(api)
    cid = add_child(api)
    tok = api.post(f"/api/parent/children/{cid}/qr").json()["token"]
    now[0] += timedelta(minutes=5, seconds=1)
    assert new_client().get("/api/child/qr-login", params={"token": tok}).status_code == 401
    tok2 = api.post(f"/api/parent/children/{cid}/qr").json()["token"]
    now[0] += timedelta(minutes=4, seconds=59)
    assert new_client().get("/api/child/qr-login", params={"token": tok2}).status_code == 200


def test_qr_only_for_own_child_or_class_member(api):
    parent(api)
    cid = add_child(api)
    other = parent(new_client(), "dad@example.com")
    assert other.post(f"/api/parent/children/{cid}/qr").status_code == 404
    t = teacher(new_client())
    room = t.post("/api/teacher/classes", json={"name": "5B"}).json()
    # ребёнок ещё не в классе учителя — QR нельзя
    assert t.post(f"/api/teacher/classes/{room['id']}/children/{cid}/qr").status_code == 404
    cc, _ = child_login()
    assert cc.post("/api/child/join-class", json={"code": room["code"]}).status_code == 200
    assert t.post(f"/api/teacher/classes/{room['id']}/children/{cid}/qr").status_code == 200
    t2 = teacher(new_client(), "t2@example.com")
    assert t2.post(f"/api/teacher/classes/{room['id']}/children/{cid}/qr").status_code == 404


# ---------- доступ ----------


def test_two_parents_see_only_own_children(api):
    parent(api)
    add_child(api, "StarFox")
    dad = parent(new_client(), "dad@example.com")
    add_child(dad, "MoonCat", [0, 1, 2])
    assert [c["nick"] for c in api.get("/api/parent/children").json()] == ["StarFox"]
    assert [c["nick"] for c in dad.get("/api/parent/children").json()] == ["MoonCat"]
    assert [n for n in dad.get("/api/parent/notifications").json()] == []


def test_two_teachers_see_only_own_classes(api):
    t1 = teacher(api)
    room = t1.post("/api/teacher/classes", json={"name": "5B"}).json()
    t2 = teacher(new_client(), "t2@example.com")
    assert t2.get("/api/teacher/classes").json() == []
    assert t2.get(f"/api/teacher/classes/{room['id']}/children").status_code == 404
    assert t1.get(f"/api/teacher/classes/{room['id']}/children").status_code == 200


def test_roles_are_separated(api):
    parent(api)
    assert api.get("/api/teacher/me").status_code == 401
    assert api.get("/api/child/me").status_code == 401
    assert new_client().get("/api/parent/children").status_code == 401


def test_tampered_session_cookie_rejected(api):
    parent(api)
    tok = api.cookies.get("studio_session")
    assert api.get("/api/parent/me").status_code == 200
    bad = new_client()
    bad.cookies.set("studio_session", tok[:-1] + ("0" if tok[-1] != "0" else "1"))
    assert bad.get("/api/parent/me").status_code == 401


def test_session_info_reports_role_without_401(api):
    assert api.get("/api/session").json() == {"role": None}
    parent(api)
    assert api.get("/api/session").json() == {"role": "parent"}
    api.post("/api/logout")
    assert api.get("/api/session").json() == {"role": None}


def test_session_cookie_is_httponly(api):
    r = api.post("/api/parent/register", json={"email": "mom@example.com", "password": PW})
    assert "httponly" in r.headers["set-cookie"].lower()


# ---------- код класса ----------


def test_class_code_shape(api):
    t = teacher(api)
    for _ in range(30):
        code = t.post("/api/teacher/classes", json={"name": "x"}).json()["code"]
        assert len(code) == 6 and not set(code) & set("O0I1")


def test_class_code_bruteforce_limited(api, now):
    t = teacher(api)
    room = t.post("/api/teacher/classes", json={"name": "5B"}).json()
    parent(api)
    add_child(api)
    cc, _ = child_login()
    for _ in range(10):
        assert cc.post("/api/child/join-class", json={"code": "ZZZZZZ"}).status_code == 404
    # 11-я — 429, даже с верным кодом
    assert cc.post("/api/child/join-class", json={"code": room["code"]}).status_code == 429
    now[0] += timedelta(minutes=15, seconds=1)
    assert cc.post("/api/child/join-class", json={"code": room["code"].lower()}).status_code == 200
    me = cc.get("/api/child/me").json()
    assert me["class"]["name"] == "5B" and "code" not in me["class"]


# ---------- ник и проверка безопасности ----------


@pytest.mark.parametrize("action", ["hold", "refuse", "rewrite", "kinder", "support"])
def test_nick_not_saved_unless_allow(api, monkeypatch, action):
    parent(api)
    monkeypatch.setattr(nickcheck, "_check_text", lambda: FakeCheck(action))
    r = api.post(
        "/api/parent/children",
        json={"nick": "AzizK", "age_group": "5-8", "lang": "ru", "pictures": PICS},
    )
    assert r.status_code == 422 and r.json()["detail"] == "nick_rejected"
    assert api.get("/api/parent/children").json() == []


def test_nick_not_saved_when_model_fails(api, monkeypatch):
    parent(api)
    monkeypatch.setattr(nickcheck, "_check_text", lambda: FakeCheck(exc=TimeoutError()))
    r = api.post(
        "/api/parent/children",
        json={"nick": "AzizK", "age_group": "5-8", "lang": "ru", "pictures": PICS},
    )
    assert r.status_code == 422
    assert api.get("/api/parent/children").json() == []


def test_nick_not_saved_when_safety_module_missing(api, monkeypatch):
    parent(api)

    def boom():
        raise ImportError("no app.safety")

    monkeypatch.setattr(nickcheck, "_check_text", boom)
    r = api.post(
        "/api/parent/children",
        json={"nick": "AzizK", "age_group": "5-8", "lang": "ru", "pictures": PICS},
    )
    assert r.status_code == 422


def test_nick_with_personal_data_shape_rejected_before_model(api, allow_nicks):
    parent(api)
    r = api.post(
        "/api/parent/children",
        json={"nick": "Aziz Karimov 5-B", "age_group": "5-8", "lang": "ru", "pictures": PICS},
    )
    assert r.status_code == 422 and allow_nicks.calls == []


def test_nick_checked_as_nickname_in_childs_language(api, allow_nicks):
    parent(api)
    add_child(api)
    assert allow_nicks.calls == [("StarFox", "nickname", "ru")]


def test_nick_unique_case_insensitive(api):
    parent(api)
    add_child(api, "StarFox")
    r = api.post(
        "/api/parent/children",
        json={"nick": "starfox", "age_group": "5-8", "lang": "ru", "pictures": PICS},
    )
    assert r.status_code == 409


# ---------- монеты ----------


def test_daily_grant_not_duplicated_and_capped(api, now):
    parent(api)
    cid = add_child(api)
    cc, _ = child_login()
    for _ in range(3):  # повторные запросы в один день
        assert cc.get("/api/child/me").json()["coins"] == 20
    with next(db.get_session()) as s:  # потратили 12 монет (#6 списывает по id генерации)
        s.add(CoinLedger(child_id=cid, delta=-12, reason="gen", ref_id="gen:1"))
        s.commit()
    assert cc.get("/api/child/me").json()["coins"] == 8
    assert cc.get("/api/child/me").json()["coins"] == 8  # тот же день — без начисления
    now[0] += timedelta(days=1)
    assert cc.get("/api/child/me").json()["coins"] == 13
    assert cc.get("/api/child/me").json()["coins"] == 13
    now[0] += timedelta(days=1)
    now[0] += timedelta(days=1)
    assert cc.get("/api/child/me").json()["coins"] == 18
    now[0] += timedelta(days=1)
    assert cc.get("/api/child/me").json()["coins"] == 20  # верх 20
    assert api.get("/api/parent/children").json()[0]["coins"] == 20


def test_ledger_ref_id_unique():
    from app.accounts import coins

    with new_client():
        pass
    db.get_engine()
    db.init_db()
    with next(db.get_session()) as s:
        from app.accounts.models import Child

        s.add(Child(nick="a", nick_norm="a", age_group="5-8", lang="ru", picture_password_hash="x"))
        s.commit()
        assert coins.add_entry(s, 1, -1, "gen", "gen:42") is True
        assert coins.add_entry(s, 1, -1, "gen", "gen:42") is False
        assert coins.balance(s, 1) == -1


def test_lock_notification_goes_only_to_own_parent(api):
    parent(api)
    add_child(api)
    dad = parent(new_client(), "dad@example.com")
    for _ in range(5):
        child_login(pics=WRONG)
    assert dad.get("/api/parent/notifications").json() == []
    with next(db.get_session()) as s:
        assert len(s.scalars(select(ParentNotification)).all()) == 1


def test_duplicate_email_and_bad_login(api):
    parent(api)
    r = new_client().post("/api/parent/register", json={"email": "MOM@example.com", "password": PW})
    assert r.status_code == 409
    bad = new_client().post("/api/parent/login", json={"email": "mom@example.com", "password": "nope-nope-1"})
    nobody = new_client().post("/api/parent/login", json={"email": "x@example.com", "password": PW})
    assert bad.status_code == nobody.status_code == 401 and bad.json() == nobody.json()
