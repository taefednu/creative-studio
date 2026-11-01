"""Тикет #6: конвейер картинки на поддельной модели. Ловушки из traps.md."""

import io
import os

os.environ.setdefault("SESSION_SECRET", "test-session-secret-0123456789abcdef")

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app import db
from app.accounts import coins, nickcheck
from app.accounts.models import CoinLedger
from app.config import get_settings
from app.main import app
from app.meta.client import ContentPolicyViolation, ModelError, ModelTimeout
from app.moderation import HeldItem
from app.works.image import pipeline
from app.works.image.models import Work

PICS = [3, 7, 1]


def png() -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(out, "PNG")
    return out.getvalue()


class D:
    def __init__(self, action="allow", safe_text=None, categories=(), urgent=False):
        self.action, self.safe_text, self.urgent = action, safe_text, urgent
        self.categories, self.reason_codes = list(categories), []


class Fake:
    """Поддельная модель: check_text / check_image / generate_image, calls — что дошло."""

    def __init__(self):
        self.text = D()
        self.text_exc = None
        self.image = D()
        self.image_exc = None
        self.gen_exc = None
        self.text_calls, self.gen_calls, self.img_calls = [], [], []

    def check_text(self, text, kind, lang):
        self.text_calls.append((text, kind, lang))
        if self.text_exc:
            raise self.text_exc
        return self.text

    def check_image(self, data, kind, lang):
        self.img_calls.append(kind)
        if self.image_exc:
            raise self.image_exc
        return self.image

    def generate_image(self, prompt, user, timeout):
        self.gen_calls.append((prompt, user, timeout))
        if self.gen_exc:
            raise self.gen_exc
        return png()


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "_engine", None)
    monkeypatch.setattr(db, "_session_factory", None)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/t.db")
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "up"))
    get_settings.cache_clear()
    monkeypatch.setattr(nickcheck, "_check_text", lambda: lambda *a, **k: D())
    yield
    if db._engine is not None:
        db._engine.dispose()
    get_settings.cache_clear()


@pytest.fixture
def fake(monkeypatch):
    f = Fake()
    monkeypatch.setattr(pipeline, "check_text", f.check_text)
    monkeypatch.setattr(pipeline, "check_image", f.check_image)
    monkeypatch.setattr(pipeline, "generate_image", f.generate_image)
    return f


@pytest.fixture
def api():
    with TestClient(app) as c:
        yield c


def make_child(api, parent_email="p@x.io", nick="Mila"):
    api.post("/api/parent/register", json={"email": parent_email, "password": "correct-horse-1"})
    cid = api.post(
        "/api/parent/children",
        json={"nick": nick, "age_group": "5-8", "lang": "ru", "pictures": PICS},
    ).json()["id"]
    return cid


def child_client(nick="Mila") -> TestClient:
    c = TestClient(app)
    assert c.post("/api/child/login", json={"nick": nick, "pictures": PICS}).status_code == 200
    return c


@pytest.fixture
def kid(api):
    cid = make_child(api)
    return cid, child_client()


def bal(cid):
    with db.new_session() as s:
        return coins.balance(s, cid)


_n = [0]


def draw(kid_client, template="space_pet", text=None, rid=None):
    _n[0] += 1
    r = kid_client.post(
        "/api/works",
        json={"template_id": template, "text": text, "request_id": rid or f"req-{_n[0]:08d}"},
    )
    return r


def status(kid_client, wid):
    return kid_client.get(f"/api/works/{wid}").json()


def held_items(item_type=None):
    with db.new_session() as s:
        q = select(HeldItem)
        if item_type:
            q = q.where(HeldItem.item_type == item_type)
        return list(s.scalars(q))


def test_two_taps_no_text_ready(kid, fake):
    cid, k = kid
    r = draw(k)
    assert r.status_code == 200
    st = status(k, r.json()["id"])
    assert st["status"] == "ready" and st["image_url"]
    assert bal(cid) == 19
    assert fake.text_calls == []  # текста нет — проверять нечего
    assert fake.gen_calls[0][1] == f"child-{cid}"
    assert fake.gen_calls[0][2] == 60
    assert k.get(st["image_url"]).headers["content-type"] == "image/webp"


@pytest.mark.parametrize(
    "mode",
    ["refuse", "hold", "support", "kinder", "unknown", "exception", "timeout"],
)
def test_text_failure_modes_no_generation_no_charge(kid, fake, mode):
    cid, k = kid
    if mode == "exception":
        fake.text_exc = RuntimeError("junk json")
    elif mode == "timeout":
        fake.text_exc = ModelTimeout("t")
    else:
        fake.text = D(mode)
    wid = draw(k, text="что-то").json()["id"]
    st = status(k, wid)
    assert fake.gen_calls == [] and fake.img_calls == []
    assert bal(cid) == 20
    assert st["status"] != "ready" and st["image_url"] is None
    if mode == "refuse":
        assert st["status"] == "refused" and held_items() == []
    elif mode == "support":
        (h,) = held_items("prompt")
        assert st["status"] == "support" and h.urgent and h.reviewer == "both"
    else:
        (h,) = held_items("prompt")
        assert st["status"] == "held" and h.reviewer == "parent" and h.preview_text == "что-то"


def test_prompt_is_template_plus_checked_text_not_raw(kid, fake):
    cid, k = kid
    fake.text = D("rewrite", safe_text="a kind knight")
    wid = draw(k, template="castle", text="RAW kid words").json()["id"]
    st = status(k, wid)
    # ребёнок ещё не согласился: ни генерации, ни списания
    assert st["status"] == "proposed" and st["rewrite_text"] == "a kind knight"
    assert fake.gen_calls == [] and bal(cid) == 20
    assert k.post(f"/api/works/{wid}/accept").json()["status"] in ("checking", "ready")
    prompt = fake.gen_calls[0][0]
    assert "a kind knight" in prompt and "RAW" not in prompt
    assert "fantasy" in prompt and prompt.startswith("A friendly children's illustration")
    assert len(fake.text_calls) == 1  # после accept текст повторно не проверяем


def test_allow_uses_original_text(kid, fake):
    _, k = kid
    draw(k, text="a red fox")
    assert "Subject: a red fox" in fake.gen_calls[0][0]
    assert fake.text_calls[0][1] == "prompt"


@pytest.mark.parametrize(
    "exc", [ModelTimeout("t"), ModelError("http 500", 500), ModelError("http 400", 400), ValueError("x")]
)
def test_generation_failure_refunds(kid, fake, exc):
    cid, k = kid
    fake.gen_exc = exc
    st = status(k, draw(k).json()["id"])
    assert st["status"] == "failed" and st["image_url"] is None
    assert bal(cid) == 20


def test_content_policy_refunds_and_holds_prompt(kid, fake):
    cid, k = kid
    fake.gen_exc = ContentPolicyViolation("cpv", 400)
    st = status(k, draw(k, text="x").json()["id"])
    assert st["status"] == "refused"
    assert bal(cid) == 20
    (h,) = held_items("prompt")
    assert h.reviewer == "parent" and "content_policy" in h.reason_codes


@pytest.mark.parametrize("mode", ["hold", "refuse", "kinder", "exception", "support"])
def test_unsafe_or_unchecked_image_not_shown(kid, fake, mode, api):
    cid, k = kid
    if mode == "exception":
        fake.image_exc = RuntimeError("down")
    else:
        fake.image = D(mode)
    wid = draw(k).json()["id"]
    st = status(k, wid)
    assert st["status"] == "held" and st["image_url"] is None
    assert k.get(f"/api/works/{wid}/image").status_code == 404
    assert bal(cid) == 20
    (h,) = held_items("image")
    assert h.reviewer == ("both" if mode == "support" else "parent")
    assert h.urgent == (mode == "support")
    # родитель видит held для проверки
    assert api.get(f"/api/works/{wid}/image").status_code == 200


def test_double_click_one_work_one_coin(kid, fake):
    cid, k = kid
    a = draw(k, rid="same-request-1").json()
    b = draw(k, rid="same-request-1").json()
    assert a["id"] == b["id"]
    assert len(fake.gen_calls) == 1
    assert bal(cid) == 19


def test_refund_exactly_once(kid, fake):
    cid, k = kid
    fake.gen_exc = ModelError("x", 500)
    wid = draw(k).json()["id"]
    with db.new_session() as s:
        w = s.get(Work, wid)
        pipeline.refund_once(s, w)
        pipeline.refund_once(s, w)
        refunds = s.scalars(select(CoinLedger).where(CoinLedger.reason == "refund")).all()
    assert len(refunds) == 1
    assert bal(cid) == 20


def test_no_coins_402_no_generation(kid, fake):
    cid, k = kid
    with db.new_session() as s:
        coins.add_entry(s, cid, -20, "test", "drain")
        s.commit()
    assert draw(k).status_code == 402
    assert fake.gen_calls == []


def test_other_child_and_anon_get_404(api, kid, fake):
    _cid, k = kid
    wid = draw(k).json()["id"]
    other = TestClient(app)
    make_other = TestClient(app)
    make_other.post("/api/parent/register", json={"email": "q@x.io", "password": "correct-horse-1"})
    make_other.post(
        "/api/parent/children",
        json={"nick": "Bobo", "age_group": "5-8", "lang": "ru", "pictures": PICS},
    )
    other.post("/api/child/login", json={"nick": "Bobo", "pictures": PICS})
    assert other.get(f"/api/works/{wid}/image").status_code == 404
    assert other.get(f"/api/works/{wid}").status_code == 404
    assert make_other.get(f"/api/works/{wid}/image").status_code == 404  # чужой родитель
    assert TestClient(app).get(f"/api/works/{wid}/image").status_code == 404
    assert k.get(f"/api/works/{wid}/image").status_code == 200


def test_mine_and_templates(kid, fake):
    _, k = kid
    draw(k)
    fake.text = D("refuse")
    draw(k, text="x")
    mine = k.get("/api/works/mine").json()
    assert [m["status"] for m in mine] == ["refused", "ready"]
    data = k.get("/api/templates").json()
    t = data["templates"]
    assert data["price"] == 1
    assert len(t) >= 8 and all(x["id"] and x["image_url"] for x in t)


def test_price_comes_from_config(kid, fake, monkeypatch):
    cid, k = kid
    monkeypatch.setenv("IMAGE_PRICE", "2")
    get_settings.cache_clear()
    assert k.get("/api/templates").json()["price"] == 2
    draw(k)
    assert bal(cid) == 18


def test_hold_urgent_goes_to_both(kid, fake):
    _, k = kid
    fake.text = D("hold", urgent=True)
    draw(k, text="x")
    (h,) = held_items("prompt")
    assert h.urgent and h.reviewer == "both"


def _with_item(item_type):
    with db.new_session() as s:
        return s.scalars(select(HeldItem).where(HeldItem.item_type == item_type)).one().id


def test_urgent_item_cannot_be_approved(kid, fake):
    from app.moderation import decide

    _, k = kid
    fake.text = D("support")
    wid = draw(k, text="x").json()["id"]
    with db.new_session() as s:
        item = s.get(HeldItem, _with_item("prompt"))
        assert decide(s, item, True, "parent:1") is False
        s.refresh(item)
        assert item.status == "pending"
    assert fake.gen_calls == [] and status(k, wid)["status"] == "support"


def test_double_approval_one_generation_one_charge(kid, fake, monkeypatch):
    from app.moderation import decide

    cid, k = kid
    monkeypatch.setattr(pipeline, "spawn", pipeline.run)  # поток → inline, чтобы проверить итог
    fake.text = D("hold")
    wid = draw(k, text="x").json()["id"]
    with db.new_session() as s:
        item = s.get(HeldItem, _with_item("prompt"))
        assert decide(s, item, True, "parent:1") is True
        assert decide(s, item, True, "parent:1") is False
    assert len(fake.gen_calls) == 1 and bal(cid) == 19
    assert status(k, wid)["status"] == "ready"


def test_approval_after_content_policy_charges_again(kid, fake, monkeypatch):
    from app.moderation import decide

    cid, k = kid
    monkeypatch.setattr(pipeline, "spawn", pipeline.run)
    fake.gen_exc = ContentPolicyViolation("cpv", 400)
    wid = draw(k, text="x").json()["id"]
    assert bal(cid) == 20
    fake.gen_exc = None
    with db.new_session() as s:
        assert decide(s, s.get(HeldItem, _with_item("prompt")), True, "parent:1")
    assert bal(cid) == 19 and status(k, wid)["status"] == "ready"
    with db.new_session() as s:
        refs = list(s.scalars(select(CoinLedger.ref_id)))
    assert f"gen:{wid}:1" in refs and f"gen:{wid}:2" in refs and f"refund:{wid}:1" in refs


def test_decline_proposed_no_charge_and_double_accept(kid, fake):
    cid, k = kid
    fake.text = D("rewrite", safe_text="kind")
    w1 = draw(k, text="x").json()["id"]
    assert k.post(f"/api/works/{w1}/decline").json()["status"] == "refused"
    assert fake.gen_calls == [] and bal(cid) == 20
    assert k.post(f"/api/works/{w1}/accept").json()["status"] == "refused"  # из refused нельзя
    w2 = draw(k, text="y").json()["id"]
    k.post(f"/api/works/{w2}/accept")
    k.post(f"/api/works/{w2}/accept")
    assert len(fake.gen_calls) == 1 and bal(cid) == 19


def test_accept_only_by_author(api, kid, fake):
    _, k = kid
    fake.text = D("rewrite", safe_text="kind")
    wid = draw(k, text="x").json()["id"]
    assert api.post(f"/api/works/{wid}/accept").status_code == 401  # родитель не автор
    assert TestClient(app).post(f"/api/works/{wid}/accept").status_code == 401
    assert fake.gen_calls == []


def test_restart_recovers_stuck_works(kid, fake):
    cid, k = kid
    with db.new_session() as s:
        w = Work(child_id=cid, template_id="clay", request_id="stuck-0001", status="generating")
        s.add(w)
        s.commit()
        coins.add_entry(s, cid, -1, "generation", f"gen:{w.id}:1")
        s.commit()
        wid = w.id
    assert bal(cid) == 19
    with TestClient(app):  # старт приложения = lifespan
        pass
    assert status(k, wid)["status"] == "failed" and bal(cid) == 20
    with TestClient(app):  # повторный старт: возврат один
        pass
    assert bal(cid) == 20


def test_charge_never_goes_negative(kid, fake):
    cid, _k = kid
    with db.new_session() as s:
        coins.add_entry(s, cid, -19, "test", "drain")
        s.commit()
        assert coins.charge(s, cid, 1, "generation", "g1") == "ok"
        assert coins.charge(s, cid, 1, "generation", "g2") == "no_coins"
        s.commit()
        assert coins.balance(s, cid) == 0
        coins.add_entry(s, cid, 5, "test", "topup")
        assert coins.charge(s, cid, 1, "generation", "g1") == "duplicate"
        coins.add_entry(s, cid, -5, "test", "untop")
        s.commit()
        assert coins.balance(s, cid) == 0
    with db.new_session() as s:  # работа при нулевом балансе: failed, без генерации
        w = Work(child_id=cid, template_id="clay", request_id="nocoin-01")
        s.add(w)
        s.commit()
        pipeline.run(w.id)
        s.refresh(w)
        assert w.status == "failed" and "no_coins" in w.reason_codes
    assert fake.gen_calls == [] and bal(cid) == 0


def test_parent_gets_no_file_while_generating(api, kid, fake):
    _cid, k = kid
    wid = draw(k).json()["id"]
    assert api.get(f"/api/works/{wid}/image").status_code == 200
    with db.new_session() as s:
        s.get(Work, wid).status = "generating"
        s.commit()
    assert api.get(f"/api/works/{wid}/image").status_code == 404
