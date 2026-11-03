"""Тикет #5: вход через Mentorium и монеты платформы. Платформа поддельная (httpx.MockTransport)."""

import io
import json
import logging
import os

os.environ.setdefault("SESSION_SECRET", "test-session-secret-0123456789abcdef")

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app import db
from app.accounts import coins, nickcheck
from app.accounts.models import Child, CoinLedger, Parent
from app.config import get_settings
from app.main import app
from app.moderation import HeldItem
from app.platform import client as pc
from app.platform import router as platform_router
from app.works.image import pipeline
from app.works.image.models import Work

UID = "11111111-1111-4111-8111-111111111111"  # id пользователя платформы
STUDENT_ID = "22222222-2222-4222-8222-222222222222"  # id ученика: не он идёт в adjust
ADMIN_TOKEN = "admin-token-xyz"
PASSWORD = "kid-password-S3cret"
ADMIN_PASSWORD = "admin-svc-pw-123"


def png() -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(out, "PNG")
    return out.getvalue()


class D:
    def __init__(self, action="allow"):
        self.action, self.safe_text, self.urgent = action, None, False
        self.categories, self.reason_codes = [], []


class FakePlatform:
    """Поддельная платформа. Режимы login_mode / wallet_mode / adjust_mode; calls — что дошло."""

    def __init__(self):
        self.accounts = {"kid@x.io": (PASSWORD, UID, "student")}
        self.coins = {UID: 5}
        self.login_mode = "ok"
        self.wallet_mode = "ok"
        self.adjust_mode = "ok"  # ok | timeout | http_500 | http_403 | refund_500 | refund_403 | drift
        self.logins: list[str] = []
        self.adjusts: list[tuple[str, int, str]] = []
        self.paths: list[str] = []

    def handler(self, req: httpx.Request) -> httpx.Response:
        path = req.url.path
        self.paths.append(path)
        if path == "/api/auth/login":
            body = json.loads(req.content)
            who = body["email"]
            if who == "svc@x.io":
                ok = body["password"] == ADMIN_PASSWORD
                return httpx.Response(200 if ok else 401, json={"access_token": ADMIN_TOKEN, "user": {}})
            self.logins.append(who)
            m = self.login_mode
            if m == "timeout":
                raise httpx.ReadTimeout("t", request=req)
            if m == "captcha":
                d = {"code": "CAPTCHA_REQUIRED", "attempts": 3, "threshold": 3}
                return httpx.Response(400, json={"detail": d})
            if m == "http_429":
                return httpx.Response(429, json={"detail": "too many"})
            if m == "http_500":
                return httpx.Response(500, text="boom")
            if m == "garbage":
                return httpx.Response(200, text="<html>not json")
            acc = self.accounts.get(who)
            if acc is None or acc[0] != body["password"] or m == "bad_password":
                return httpx.Response(401, json={"detail": "Invalid login or password"})
            user = {"id": acc[1], "role": acc[2], "email": who, "full_name": "Настоящее Имя"}
            return httpx.Response(
                200, json={"user": user, "tokens": {"access_token": "kid-token"}, "access_token": "kid-token"}
            )
        if req.headers.get("authorization") != f"Bearer {ADMIN_TOKEN}":
            return httpx.Response(401, json={"detail": "no"})
        uid = path.split("/")[4]
        if path.endswith("/wallet/adjust"):
            body = json.loads(req.content)
            if self.adjust_mode == "timeout":
                raise httpx.ReadTimeout("t", request=req)
            plus = body["coins_delta"] > 0
            if self.adjust_mode == "http_500" or (self.adjust_mode == "refund_500" and plus):
                return httpx.Response(500, json={"detail": "err"})
            if self.adjust_mode == "http_403" or (self.adjust_mode == "refund_403" and plus):
                return httpx.Response(403, json={"detail": "no"})
            if self.adjust_mode == "drift":  # баланс изменился между чтением и списанием
                self.coins[uid] += 3
            self.adjusts.append((uid, body["coins_delta"], body["reason"]))
            self.coins[uid] = max(0, self.coins[uid] + body["coins_delta"])
            return httpx.Response(200, json={"user_id": uid, "coins": self.coins[uid]})
        if self.wallet_mode == "down":
            raise httpx.ConnectError("down", request=req)
        if self.wallet_mode == "http_500":
            return httpx.Response(500, json={"detail": "err"})
        return httpx.Response(200, json={"coins": self.coins[uid], "xp": 0})


class Gen:
    def __init__(self):
        self.calls = []
        self.exc = None
        self.text = D()


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "_engine", None)
    monkeypatch.setattr(db, "_session_factory", None)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/t.db")
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "up"))
    monkeypatch.delenv("PLATFORM_API_URL", raising=False)
    get_settings.cache_clear()
    monkeypatch.setattr(nickcheck, "_check_text", lambda: lambda *a, **k: D())
    platform_router._paused.clear()
    yield
    pc.set_client(None)
    if db._engine is not None:
        db._engine.dispose()
    get_settings.cache_clear()


@pytest.fixture
def plat(monkeypatch):
    fake = FakePlatform()
    monkeypatch.setenv("PLATFORM_API_URL", "http://platform.test")
    monkeypatch.setenv("PLATFORM_ADMIN_LOGIN", "svc@x.io")
    monkeypatch.setenv("PLATFORM_ADMIN_PASSWORD", ADMIN_PASSWORD)
    get_settings.cache_clear()
    pc.set_client(
        pc.PlatformClient(
            "http://platform.test", "svc@x.io", ADMIN_PASSWORD, 5, httpx.MockTransport(fake.handler)
        )
    )
    return fake


@pytest.fixture
def gen(monkeypatch):
    g = Gen()

    def generate(prompt, user, timeout):
        g.calls.append(prompt)
        if g.exc:
            raise g.exc
        return png()

    monkeypatch.setattr(pipeline, "check_text", lambda *a: g.text)
    monkeypatch.setattr(pipeline, "check_image", lambda *a: D())
    monkeypatch.setattr(pipeline, "generate_image", generate)
    return g


@pytest.fixture
def api():
    with TestClient(app) as c:
        yield c


def pl_login(api, login="kid@x.io", password=PASSWORD, lang=None):
    body = {"login": login, "password": password, **({"lang": lang} if lang else {})}
    return api.post("/api/auth/platform-login", json=body)


def ledger(ref=None):
    with db.new_session() as s:
        q = select(CoinLedger).order_by(CoinLedger.id)
        if ref:
            q = q.where(CoinLedger.ref_id == ref)
        return [(r.ref_id, r.delta, r.status) for r in s.scalars(q)]


_n = [0]


def draw(api):
    _n[0] += 1
    return api.post(
        "/api/works",
        json={"template_id": "space_pet", "text": None, "request_id": f"req-{_n[0]:08d}"},
    )


def wstatus(api, wid):
    return api.get(f"/api/works/{wid}").json()


# ---------------- вход ----------------


def test_login_ok_creates_local_child_without_personal_data(api, plat):
    r = pl_login(api)
    assert r.status_code == 200 and r.json() == {"ok": True, "role": "child"}
    me = api.get("/api/child/me").json()
    assert me["coins"] == 5 and me["coins_source"] == "platform"
    assert "Настоящее" not in json.dumps(me) and "kid@x.io" not in json.dumps(me)
    with db.new_session() as s:
        c = s.scalar(select(Child))
        assert c.platform_user_id == UID and c.picture_password_hash is None
        assert c.nick not in ("kid", "Настоящее Имя") and c.parent_id is None
    pl_login(TestClient(app))  # повторный вход — тот же ребёнок
    with db.new_session() as s:
        assert len(s.scalars(select(Child)).all()) == 1
    assert ledger() == []  # ни стартовых, ни дневных монет студии


@pytest.mark.parametrize(
    ("mode", "status", "code"),
    [
        ("bad_password", 401, "bad_credentials"),
        ("captcha", 429, "platform_captcha"),
        ("http_429", 429, "platform_busy"),
        ("http_500", 503, "platform_unavailable"),
        ("timeout", 503, "platform_unavailable"),
        ("garbage", 503, "platform_unavailable"),
    ],
)
def test_login_failure_modes(api, plat, caplog, mode, status, code):
    plat.login_mode = mode
    with caplog.at_level(logging.DEBUG):
        r = pl_login(api)
    assert r.status_code == status
    d = r.json()["detail"]
    assert (d["code"] if isinstance(d, dict) else d) == code
    if code == "platform_captcha":
        assert set(d["messages"]) == {"ru", "en", "uz"}
    assert PASSWORD not in r.text and PASSWORD not in caplog.text
    assert api.get("/api/session").json() == {"role": None}


def test_unknown_role_is_403(api, plat):
    plat.accounts["kid@x.io"] = (PASSWORD, UID, "admin")
    assert pl_login(api).status_code == 403
    assert api.get("/api/session").json() == {"role": None}


def test_not_configured_is_503(api):
    pc.set_client(None)
    r = pl_login(api)
    assert r.status_code == 503 and r.json()["detail"] == "platform_not_configured"
    assert api.get("/api/health").status_code == 200  # приложение живёт без платформы


def test_captcha_pause_does_not_hit_platform_again(api, plat):
    plat.login_mode = "captcha"
    pl_login(api)
    plat.login_mode = "ok"
    assert pl_login(api).status_code == 429
    assert plat.logins == ["kid@x.io"]  # второй раз на платформу не ушли


def test_password_never_in_logs_or_responses(api, plat, caplog):
    with caplog.at_level(logging.DEBUG):
        r = pl_login(api)
        bad = api.post("/api/auth/platform-login", json={"login": "kid@x.io"})  # без пароля
        garbage = api.post("/api/auth/platform-login", content=b"{" + PASSWORD.encode())
    assert bad.status_code == garbage.status_code == 422
    for text in (r.text, bad.text, garbage.text, caplog.text):
        assert PASSWORD not in text and ADMIN_PASSWORD not in text
    assert ADMIN_PASSWORD not in repr(get_settings())


def test_parent_and_teacher_roles(api, plat):
    plat.accounts["mom@x.io"] = (PASSWORD, "33333333-3333-4333-8333-333333333333", "parent")
    plat.accounts["t@x.io"] = (PASSWORD, "44444444-4444-4444-8444-444444444444", "teacher")
    assert pl_login(api, "mom@x.io").json()["role"] == "parent"
    assert api.get("/api/parent/me").json()["email"] is None
    t = TestClient(app)
    assert pl_login(t, "t@x.io").json()["role"] == "teacher"
    assert t.get("/api/teacher/me").status_code == 200
    # вход по почте студии не сломан
    assert api.post("/api/parent/register", json={"email": "a@b.io", "password": "correct-horse-1"}).status_code == 201


# ---------------- монеты ----------------


def test_charge_goes_to_platform_by_user_id_not_student_id(api, plat, gen):
    pl_login(api)
    wid = draw(api).json()["id"]
    assert wstatus(api, wid)["status"] == "ready"
    assert plat.adjusts == [(UID, -1, f"Mentorium Creative Studio: gen:{wid}:1")]
    assert STUDENT_ID not in "".join(plat.paths)
    assert plat.coins[UID] == 4
    assert ledger(f"gen:{wid}:1") == [(f"gen:{wid}:1", -1, "done")]
    assert api.get("/api/child/me").json()["coins"] == 4


def test_double_click_and_replay_charge_once(api, plat, gen):
    pl_login(api)
    body = {"template_id": "space_pet", "text": None, "request_id": "same-req-0001"}
    a = api.post("/api/works", json=body).json()["id"]
    b = api.post("/api/works", json=body).json()["id"]
    assert a == b and len(plat.adjusts) == 1
    pipeline.run(a)  # повторный запуск той же попытки (гонка/перезапуск) списание не повторяет
    assert len(plat.adjusts) == 1 and len(gen.calls) == 1


def test_no_coins_no_adjust_no_generation(api, plat, gen):
    plat.coins[UID] = 0
    pl_login(api)
    assert draw(api).status_code == 402
    # и на уровне конвейера: баланс ушёл в ноль между проверкой ручки и списанием
    with db.new_session() as s:
        cid = s.scalar(select(Child.id))
        w = Work(child_id=cid, template_id="space_pet", request_id="direct-req-1")
        s.add(w)
        s.commit()
        wid = w.id
    pipeline.run(wid)
    with db.new_session() as s:
        w = s.get(Work, wid)
        assert w.status == "failed" and w.reason_codes == ["no_coins"]
    assert plat.adjusts == [] and gen.calls == [] and ledger() == []


@pytest.mark.parametrize("mode", ["down", "http_500"])
def test_platform_down_blocks_generation_and_keeps_coins(api, plat, gen, mode):
    pl_login(api)
    plat.wallet_mode = mode
    r = draw(api)
    assert r.status_code == 503 and r.json()["detail"] == "platform_unavailable"
    assert plat.adjusts == [] and gen.calls == [] and ledger() == []
    assert api.get("/api/child/me").json()["coins"] is None  # не «ноль монет»


def test_adjust_rejected_means_no_generation_and_no_charge(api, plat, gen):
    pl_login(api)
    plat.adjust_mode = "http_403"  # 4xx: отвергнуто до записи
    wid = draw(api).json()["id"]
    st = wstatus(api, wid)
    assert st["status"] == "failed" and st["reason_codes"] == ["platform_unavailable"]
    assert gen.calls == [] and ledger() == [(f"gen:{wid}:1", 0, "failed")]


@pytest.mark.parametrize("mode", ["http_500", "drift"])
def test_5xx_or_balance_mismatch_on_charge_is_uncertain(api, plat, gen, mode):
    """5xx приходит после commit платформы; обрезка до 0 / дрейф баланса тоже: возврата нет."""
    pl_login(api)
    plat.adjust_mode = mode
    wid = draw(api).json()["id"]
    st = wstatus(api, wid)
    assert st["status"] == "failed" and st["reason_codes"] == ["platform_uncertain"]
    assert gen.calls == [] and ledger() == [(f"gen:{wid}:1", -1, "uncertain")]
    plat.adjust_mode = "ok"
    before = len(plat.adjusts)
    pipeline.recover_stuck()
    assert len(plat.adjusts) == before  # ни возврата, ни повтора


def test_adjust_timeout_is_uncertain_no_generation_no_refund(api, plat, gen, caplog):
    pl_login(api)
    plat.adjust_mode = "timeout"
    with caplog.at_level(logging.WARNING):
        wid = draw(api).json()["id"]
    st = wstatus(api, wid)
    assert st["status"] == "failed" and st["reason_codes"] == ["platform_uncertain"]
    assert gen.calls == [] and plat.adjusts == []
    assert ledger() == [(f"gen:{wid}:1", -1, "uncertain")]  # и возврата нет
    assert "uncertain" in caplog.text and PASSWORD not in caplog.text
    plat.adjust_mode = "ok"
    with db.new_session() as s:
        pipeline.refund_once(s, s.get(Work, wid))
    assert plat.adjusts == [] and len(ledger()) == 1


def test_generation_failure_refunds_exactly_once(api, plat, gen):
    pl_login(api)
    gen.exc = RuntimeError("model down")
    wid = draw(api).json()["id"]
    assert wstatus(api, wid)["status"] == "failed"
    assert [a[1] for a in plat.adjusts] == [-1, 1]
    assert plat.adjusts[1][2] == f"Mentorium Creative Studio: refund:{wid}:1"
    assert plat.coins[UID] == 5
    with db.new_session() as s:  # повтор возврата
        pipeline.refund_once(s, s.get(Work, wid))
    pipeline.recover_stuck()
    assert [a[1] for a in plat.adjusts] == [-1, 1]
    assert ledger(f"refund:{wid}:1")[0][2] == "done"


def test_refund_5xx_is_uncertain_and_not_repeated_on_start(api, plat, gen):
    pl_login(api)
    gen.exc = RuntimeError("model down")
    plat.adjust_mode = "refund_500"
    wid = draw(api).json()["id"]
    assert ledger(f"refund:{wid}:1")[0][2] == "uncertain"
    plat.adjust_mode = "ok"
    n = len(plat.adjusts)
    pipeline.recover_stuck()
    assert len(plat.adjusts) == n  # второго adjust нет


def test_refund_failure_is_retried_on_start_at_most_once(api, plat, gen):
    pl_login(api)
    gen.exc = RuntimeError("model down")
    plat.adjust_mode = "refund_403"
    wid = draw(api).json()["id"]
    assert ledger(f"refund:{wid}:1")[0][2] == "refund_pending"
    assert plat.coins[UID] == 4  # монета пока не вернулась
    plat.adjust_mode = "ok"
    pipeline.recover_stuck()  # старт приложения
    assert plat.coins[UID] == 5 and ledger(f"refund:{wid}:1")[0][2] == "done"
    pipeline.recover_stuck()
    pipeline.recover_stuck()
    assert plat.coins[UID] == 5 and [a[1] for a in plat.adjusts] == [-1, 1]


def test_crash_between_charge_and_result_is_not_refunded(api, plat, gen):
    """Процесс упал после записи намерения: результат неизвестен, возвращать нельзя."""
    pl_login(api)
    with db.new_session() as s:
        cid = s.scalar(select(Child.id))
        w = Work(child_id=cid, template_id="space_pet", request_id="crash-req-01", status="checking")
        s.add(w)
        s.flush()
        coins.add_entry(s, cid, -1, "generation", f"gen:{w.id}:1", status="pending")
        s.commit()
    pipeline.recover_stuck()
    assert plat.adjusts == [] and ledger()[0][2] == "uncertain"


def test_admin_token_relogin_on_401(plat):
    c = pc.get_client()
    c._token = "stale"
    assert c.balance(UID) == 5
    assert c._token == ADMIN_TOKEN


def test_studio_child_still_uses_studio_coins(api, plat, gen):
    api.post("/api/parent/register", json={"email": "p@x.io", "password": "correct-horse-1"})
    api.post(
        "/api/parent/children",
        json={"nick": "Mila", "age_group": "5-8", "lang": "ru", "pictures": [3, 7, 1]},
    )
    k = TestClient(app)
    k.post("/api/child/login", json={"nick": "Mila", "pictures": [3, 7, 1]})
    assert draw(k).status_code == 200
    assert plat.paths == [] and plat.adjusts == []
    assert k.get("/api/child/me").json()["coins_source"] == "studio"
    assert [r[1] for r in ledger() if r[0].startswith("gen:")] == [-1]


# ---------------- привязка родителя и запрет публикации ----------------


def parent_client(email="p@x.io") -> TestClient:
    p = TestClient(app)
    assert p.post("/api/parent/register", json={"email": email, "password": "correct-horse-1"}).status_code == 201
    return p


def test_link_code_flow(api, plat):
    pl_login(api)
    code = api.post("/api/child/parent-link-code").json()["code"]
    assert len(code) == 6
    p = parent_client()
    assert p.post("/api/parent/link-child", json={"code": "ZZZZZZ"}).status_code == 404
    r = p.post("/api/parent/link-child", json={"code": code.lower()})
    assert r.status_code == 200
    kids = p.get("/api/parent/children").json()
    assert len(kids) == 1 and kids[0]["coins"] == 5
    assert api.get("/api/child/me").json()["has_parent"] is True
    # одноразово
    assert parent_client("q@x.io").post("/api/parent/link-child", json={"code": code}).status_code == 404
    assert api.post("/api/child/parent-link-code").status_code == 409  # родитель уже есть


def test_link_code_expires(api, plat, monkeypatch):
    pl_login(api)
    code = api.post("/api/child/parent-link-code").json()["code"]
    from datetime import timedelta

    from app import clock

    real = clock.now
    monkeypatch.setattr(clock, "now", lambda: real() + timedelta(minutes=61))
    assert parent_client().post("/api/parent/link-child", json={"code": code}).status_code == 404


def test_link_does_not_rebind_child_that_has_parent(api, plat):
    pl_login(api)
    code = api.post("/api/child/parent-link-code").json()["code"]
    first = parent_client("first@x.io")
    with db.new_session() as s:  # родитель появился другим путём, пока код жил
        s.get(Child, s.scalar(select(Child.id))).parent_id = s.scalar(select(Parent.id))
        s.commit()
    r = parent_client("second@x.io").post("/api/parent/link-child", json={"code": code})
    assert r.status_code == 409 and r.json()["detail"] == "already_linked"
    assert first.get("/api/parent/children").json()[0]["nick"]  # у первого остался


def test_link_wrong_codes_are_limited(api, plat):
    pl_login(api)
    code = api.post("/api/child/parent-link-code").json()["code"]
    p = parent_client()
    for _ in range(get_settings().CODE_FAILS_MAX):
        assert p.post("/api/parent/link-child", json={"code": "ZZZZZZ"}).status_code == 404
    assert p.post("/api/parent/link-child", json={"code": code}).status_code == 429


def test_child_without_adult_draws_but_cannot_publish_comment_react(api, plat, gen):
    pl_login(api)
    wid = draw(api).json()["id"]
    assert wstatus(api, wid)["status"] == "ready"  # рисовать для себя можно
    assert api.get("/api/child/me").json()["needs_adult"] is True
    for audience in ("class", "family"):
        r = api.post("/api/posts", json={"work_id": wid, "audience": audience})
        assert r.status_code == 403 and r.json()["detail"] == "needs_adult"
    assert api.post("/api/posts/1/comments", json={"text": "hi"}).status_code == 403
    assert api.put("/api/posts/1/reactions/like").status_code == 403
    assert api.post("/api/posts/1/remix", json={"text": "x", "request_id": "remix-req-01"}).status_code == 403
    # после привязки родителя семейный пост проходит
    code = api.post("/api/child/parent-link-code").json()["code"]
    parent_client().post("/api/parent/link-child", json={"code": code})
    r = api.post("/api/posts", json={"work_id": wid, "audience": "family"})
    assert r.status_code == 200 and r.json()["status"] == "published"


def test_self_harm_without_adult_says_nobody_notified_then_parent_sees_it(api, plat, gen):
    pl_login(api)
    gen.text = D("support")
    wid = api.post(
        "/api/works", json={"template_id": "space_pet", "text": "мне грустно", "request_id": "sup-req-001"}
    ).json()["id"]
    st = wstatus(api, wid)
    assert st["status"] == "support" and st["adult_notified"] is False
    assert plat.adjusts == []  # до списания не дошло
    with db.new_session() as s:
        assert len(s.scalars(select(HeldItem)).all()) == 1  # запись создана как обычно
    code = api.post("/api/child/parent-link-code").json()["code"]
    p = parent_client()
    p.post("/api/parent/link-child", json={"code": code})
    assert wstatus(api, wid)["adult_notified"] is True
    assert len(p.get("/api/review/queue").json()) == 1  # после привязки взрослый видит


# ---------------- правки ревью ----------------


def test_refund_settle_failure_does_not_overwrite_status(api, plat, gen, monkeypatch):
    pl_login(api)
    # картинка не прошла проверку -> held + возврат; сбой возврата статус held не затирает
    monkeypatch.setattr(pipeline, "check_image", lambda *a: D("hold"))
    from app.platform.wallet import PlatformWallet

    def boom(*a, **k):
        raise RuntimeError("db gone")

    monkeypatch.setattr(PlatformWallet, "refund_settle", boom)
    wid = draw(api).json()["id"]
    assert wstatus(api, wid)["status"] == "held"


def test_recover_stops_on_first_unavailable(api, plat, gen, monkeypatch):
    pl_login(api)
    gen.exc = RuntimeError("x")
    plat.adjust_mode = "refund_403"
    draw(api)
    draw(api)
    plat.adjust_mode = "ok"
    from app.platform import wallet as pw

    calls = []
    real = pw.PlatformWallet.refund_settle

    def down(self, db, child, ref):
        calls.append(ref)
        real(self, db, child, ref)
        return "unavailable"

    monkeypatch.setattr(pw.PlatformWallet, "refund_settle", down)
    with db.new_session() as s:
        pw.recover(s)
    assert len(calls) == 1  # остановились на первом


def test_recover_can_run_in_background(api, plat, gen):
    import threading

    pl_login(api)
    gen.exc = RuntimeError("x")
    plat.adjust_mode = "refund_403"
    draw(api)
    plat.adjust_mode = "ok"
    before = set(threading.enumerate())
    pipeline.recover_stuck(platform_in_background=True)
    for t in set(threading.enumerate()) - before:
        t.join(10)
    assert all(r[2] == "done" for r in ledger() if r[0].startswith("refund:"))


def test_admin_login_refusal_pauses_relogin(plat):
    c = pc.PlatformClient(
        "http://platform.test", "svc@x.io", "wrong-pass-1", 5, httpx.MockTransport(plat.handler)
    )
    for _ in range(3):
        with pytest.raises(pc.Unavailable):
            c.balance(UID)
    assert plat.paths.count("/api/auth/login") == 1  # пауза: новых логинов нет


def test_own_rate_limit_busy(api, plat, monkeypatch):
    monkeypatch.setenv("PLATFORM_LOGIN_PER_MINUTE", "3")
    get_settings.cache_clear()
    platform_router._hits.clear()
    codes = [pl_login(api, "x@x.io", "wrong-pw-1").status_code for _ in range(4)]
    assert codes == [401, 401, 401, 429]
    assert pl_login(api).json()["detail"] == "platform_busy"
    assert len(plat.logins) == 3  # лишние на платформу не ушли


def test_lang_on_create_and_change(api, plat):
    assert pl_login(api, lang="uz").status_code == 200
    assert api.get("/api/child/me").json()["lang"] == "uz"
    bad = {"login": "kid@x.io", "password": PASSWORD, "lang": "fr"}
    assert api.post("/api/auth/platform-login", json=bad).status_code == 422
    assert api.post("/api/child/lang", json={"lang": "en"}).json() == {"lang": "en"}
    assert api.post("/api/child/lang", json={"lang": "xx"}).status_code == 422
    assert api.get("/api/child/me").json()["lang"] == "en"


def test_qr_forbidden_for_platform_child(api, plat):
    pl_login(api)
    with db.new_session() as s:
        cid = s.scalar(select(Child.id))
    p = parent_client()
    code = api.post("/api/child/parent-link-code").json()["code"]
    p.post("/api/parent/link-child", json={"code": code})
    r = p.post(f"/api/parent/children/{cid}/qr")
    assert r.status_code == 409 and r.json()["detail"] == "platform_child"
    t = TestClient(app)
    t.post("/api/teacher/register", json={"email": "t@x.io", "password": "correct-horse-1"})
    room = t.post("/api/teacher/classes", json={"name": "3A"}).json()
    api.post("/api/child/join-class", json={"code": room["code"]})
    r = t.post(f"/api/teacher/classes/{room['id']}/children/{cid}/qr")
    assert r.status_code == 409 and r.json()["detail"] == "platform_child"


def test_picture_login_for_platform_child_counts_nothing(api, plat):
    pl_login(api)
    with db.new_session() as s:
        c = s.scalar(select(Child))
        nick, cid = c.nick, c.id
    code = api.post("/api/child/parent-link-code").json()["code"]
    p = parent_client()
    p.post("/api/parent/link-child", json={"code": code})
    for _ in range(get_settings().LOGIN_FAILS_MAX + 2):
        r = TestClient(app).post("/api/child/login", json={"nick": nick, "pictures": [1, 2, 3]})
        assert r.status_code == 401 and r.json()["detail"] == "bad_credentials"
    with db.new_session() as s:
        c = s.get(Child, cid)
        assert c.failed_attempts == 0 and c.locked_until is None
    assert p.get("/api/parent/notifications").json() == []


def test_analytics_counts_only_done_and_reports_uncertain(api, plat, gen):
    pl_login(api)
    code = api.post("/api/child/parent-link-code").json()["code"]
    p = parent_client()
    p.post("/api/parent/link-child", json={"code": code})
    cid = p.get("/api/parent/children").json()[0]["id"]
    draw(api)  # списано и подтверждено
    plat.adjust_mode = "timeout"
    draw(api)  # результат неизвестен
    a = p.get(f"/api/parent/children/{cid}/analytics").json()
    assert a["coins_spent"] == 1 and a["coins_uncertain"] == 1


def _teacher_with_class(child_api):
    t = TestClient(app)
    t.post("/api/teacher/register", json={"email": "tt@x.io", "password": "correct-horse-1"})
    room = t.post("/api/teacher/classes", json={"name": "3A"}).json()
    assert child_api.post("/api/child/join-class", json={"code": room["code"]}).status_code == 200
    return t


def test_class_child_without_parent_is_reviewed_by_teacher(api, plat, gen):
    pl_login(api)
    t = _teacher_with_class(api)
    gen.text = D("hold")  # личный промпт на проверку: обычно родителю
    body = {"template_id": "space_pet", "text": "что-то", "request_id": "orph-req-001"}
    wid = api.post("/api/works", json=body).json()["id"]
    st = wstatus(api, wid)
    assert st["status"] == "held" and st["adult_notified"] is True
    assert len(t.get("/api/review/queue").json()) == 1
    # появился родитель: старая запись видна родителю, учитель личное больше не видит
    code = api.post("/api/child/parent-link-code").json()["code"]
    p = parent_client()
    p.post("/api/parent/link-child", json={"code": code})
    assert len(p.get("/api/review/queue").json()) == 1
    assert t.get("/api/review/queue").json() == []
    body = {"template_id": "space_pet", "text": "ещё", "request_id": "orph-req-002"}
    wid2 = api.post("/api/works", json=body).json()["id"]
    assert wstatus(api, wid2)["status"] == "held"
    assert len(p.get("/api/review/queue").json()) == 2
    assert t.get("/api/review/queue").json() == []


def test_platform_429_does_not_pause_login(api, plat):
    plat.login_mode = "http_429"
    assert pl_login(api).json()["detail"] == "platform_busy"
    plat.login_mode = "ok"
    assert pl_login(api).status_code == 200  # логин на паузу не ставили


def studio_child(parent, nick="HomeKid"):
    r = parent.post("/api/parent/children", json={"nick": nick, "age_group": "5-8", "lang": "ru", "pictures": [3, 7, 1]})
    assert r.status_code == 201
    c = TestClient(app)
    assert c.post("/api/child/login", json={"nick": nick, "pictures": [3, 7, 1]}).status_code == 200
    return r.json()["id"], c


def link(c, login="kid@x.io", password=PASSWORD):
    return c.post("/api/auth/platform-link", json={"login": login, "password": password})


def test_link_keeps_works_and_studio_coins_and_does_not_double(api, plat, gen):
    _, c = studio_child(parent_client())
    before = c.get("/api/child/me").json()["coins"]
    wid = draw(c).json()["id"]
    assert wstatus(c, wid)["status"] == "ready"
    after_draw = c.get("/api/child/me").json()["coins"]
    assert after_draw == before - 1
    assert link(c).status_code == 200
    assert link(c).status_code == 200  # двойной клик ничего не меняет
    assert c.get(f"/api/works/{wid}").status_code == 200  # работа на месте
    me = c.get("/api/child/me").json()
    assert me["coins_source"] == "platform" and me["coins"] == after_draw + plat.coins[UID]
    assert plat.adjusts == []  # на платформу ничего не начислено
    # сначала тратятся студийные, платформа не тронута
    wid2 = draw(c).json()["id"]
    assert wstatus(c, wid2)["status"] == "ready"
    assert plat.adjusts == [] and c.get("/api/child/me").json()["coins"] == after_draw + plat.coins[UID] - 1


def test_refund_of_studio_coin_after_link_stays_studio(api, plat, gen):
    _, c = studio_child(parent_client())
    assert link(c).status_code == 200
    total = c.get("/api/child/me").json()["coins"]
    gen.exc = RuntimeError("boom")
    wid = draw(c).json()["id"]
    assert wstatus(c, wid)["status"] == "failed"
    assert c.get("/api/child/me").json()["coins"] == total  # вернулось
    assert plat.adjusts == []  # а не монетой платформы


def test_coins_after_studio_rest_go_to_platform(api, plat, gen):
    cid, c = studio_child(parent_client())
    assert link(c).status_code == 200
    with db.new_session() as s:
        s.get(Child, cid).studio_coins = 0
        s.commit()
    assert wstatus(c, draw(c).json()["id"])["status"] == "ready"
    assert [a[1] for a in plat.adjusts] == [-1]


def test_link_refuses_while_work_is_in_flight(api, plat, gen):
    cid, c = studio_child(parent_client())
    with db.new_session() as s:
        s.add(Work(child_id=cid, template_id="x", status="generating", request_id="r-fly"))
        s.commit()
    r = link(c)
    assert r.status_code == 409 and r.json()["detail"] == "platform_busy_work"
    with db.new_session() as s:
        assert s.get(Child, cid).platform_user_id is None


def test_link_refuses_profile_already_in_studio_and_merges_nothing(api, plat):
    pl_login(api)  # этот профиль уже есть как отдельный ребёнок студии
    cid, c = studio_child(parent_client())
    r = link(c)
    assert r.status_code == 409 and r.json()["detail"] == "platform_taken"
    with db.new_session() as s:
        assert s.get(Child, cid).platform_user_id is None


def test_link_wrong_role_and_bad_password_change_nothing(api, plat):
    p = parent_client()
    cid, c = studio_child(p)
    assert link(c, password="wrong-password").status_code == 401
    plat.accounts["dad@x.io"] = (PASSWORD, "99999999-0000-0000-0000-000000000000", "parent")
    r = link(c, login="dad@x.io")
    assert r.status_code == 403 and r.json()["detail"] == "platform_wrong_role"
    with db.new_session() as s:
        assert s.get(Child, cid).platform_user_id is None
    assert link(p, login="dad@x.io").status_code == 200
    assert link(p).status_code == 403  # логин ребёнка родителю не подходит


def test_link_second_profile_refused(api, plat):
    _, c = studio_child(parent_client())
    plat.accounts["other@x.io"] = (PASSWORD, "88888888-0000-0000-0000-000000000000", "student")
    assert link(c).status_code == 200
    r = link(c, login="other@x.io")
    assert r.status_code == 409 and r.json()["detail"] == "platform_already_linked"


def test_after_link_weak_picture_login_is_off(api, plat):
    _, c = studio_child(parent_client())
    assert link(c).status_code == 200
    r = TestClient(app).post("/api/child/login", json={"nick": "HomeKid", "pictures": [3, 7, 1]})
    assert r.status_code in (401, 403)


def test_link_needs_session_and_hides_when_not_configured(api, plat, monkeypatch):
    assert link(TestClient(app)).status_code == 401
    assert plat.logins == []
    _, c = studio_child(parent_client())
    assert c.get("/api/auth/platform-link").json() == {"enabled": True, "linked": False}
    monkeypatch.delenv("PLATFORM_API_URL")
    get_settings.cache_clear()
    assert c.get("/api/auth/platform-link").json()["enabled"] is False


def test_link_never_echoes_password(api, plat, caplog):
    _, c = studio_child(parent_client())
    r = link(c, password="wrong-secret-pass")
    assert "wrong-secret-pass" not in r.text and "wrong-secret-pass" not in caplog.text


def test_link_closed_on_demo_stand_shared_accounts(api, plat, monkeypatch):
    _, c = studio_child(parent_client())
    monkeypatch.setenv("DEMO_LOGIN", "true")
    get_settings.cache_clear()
    assert c.get("/api/auth/platform-link").json()["enabled"] is False
    r = link(c)
    assert r.status_code == 403 and plat.logins == []
    with db.new_session() as s:
        assert s.scalar(select(Child.platform_user_id).where(Child.nick == "HomeKid")) is None

