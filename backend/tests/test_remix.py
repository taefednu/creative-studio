"""Тикет #10: ремикс. Ловушки: только класс, только опубликованное, возврат монеты, проверки."""

import io
import os

os.environ.setdefault("SESSION_SECRET", "test-session-secret-0123456789abcdef")

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app import db
from app.accounts import coins, nickcheck
from app.config import get_settings
from app.feed.models import Post
from app.main import app
from app.meta.client import ContentPolicyViolation, ModelError, ModelTimeout
from app.moderation import HeldItem, decide, hold
from app.works.image import pipeline
from app.works.image.models import Work

PW = "correct-horse-1"
SRC = b"SOURCE-BLURRED-BYTES"


def png() -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (8, 8), "blue").save(out, "PNG")
    return out.getvalue()


class D:
    def __init__(self, action="allow", urgent=False):
        self.action, self.safe_text, self.urgent = action, None, urgent
        self.categories, self.reason_codes = [], []


class Fake:
    def __init__(self):
        self.text, self.text_exc = D(), None
        self.image, self.image_exc = D(), None
        self.edit_exc = None
        self.text_calls, self.edits, self.gens, self.img_calls = [], [], [], []

    def check_text(self, text, kind, lang):
        self.text_calls.append(text)
        if self.text_exc:
            raise self.text_exc
        return self.text

    def check_image(self, data, kind, lang):
        self.img_calls.append(kind)
        if self.image_exc:
            raise self.image_exc
        return self.image

    def edit_image(self, source, prompt, user, timeout):
        self.edits.append((source, prompt, user))
        if self.edit_exc:
            raise self.edit_exc
        return png()

    def generate_image(self, prompt, user, timeout):
        self.gens.append(prompt)
        return png()


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "_engine", None)
    monkeypatch.setattr(db, "_session_factory", None)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/t.db")
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "up"))
    get_settings.cache_clear()
    db.init_db()
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
    monkeypatch.setattr(pipeline, "edit_image", f.edit_image)
    monkeypatch.setattr(pipeline, "generate_image", f.generate_image)
    return f


def login(role, email):
    c = TestClient(app)
    assert c.post(f"/api/{role}/register", json={"email": email, "password": PW}).status_code == 201
    return c


def child_of(parent, nick, pics):
    r = parent.post(
        "/api/parent/children",
        json={"nick": nick, "age_group": "5-8", "lang": "ru", "pictures": list(pics)},
    )
    assert r.status_code == 201
    c = TestClient(app)
    assert c.post("/api/child/login", json={"nick": nick, "pictures": list(pics)}).status_code == 200
    return r.json()["id"], c


class World:
    pass


@pytest.fixture
def w(tmp_path, fake):
    x = World()
    x.tmp = tmp_path
    teacher = login("teacher", "t@x.io")
    room = teacher.post("/api/teacher/classes", json={"name": "3A"}).json()
    teacher2 = login("teacher", "t2@x.io")
    room2 = teacher2.post("/api/teacher/classes", json={"name": "3B"}).json()
    parent = login("parent", "p@x.io")
    x.a_id, x.a = child_of(parent, "Mila", (3, 7, 1))  # автор оригинала
    x.b_id, x.b = child_of(parent, "Tedi", (4, 8, 2))  # одноклассник-ремиксер
    for c in (x.a, x.b):
        assert c.post("/api/child/join-class", json={"code": room["code"]}).status_code == 200
    x.z_id, x.z = child_of(login("parent", "p2@x.io"), "Zoya", (5, 9, 3))  # чужой класс
    assert x.z.post("/api/child/join-class", json={"code": room2["code"]}).status_code == 200
    x.parent = parent
    x.teacher = teacher
    x.post = make_post(x, x.a_id, x.a)
    return x


def make_post(x, child_id, client, audience="class", kind="image"):
    f = x.tmp / f"src{child_id}{kind}{os.urandom(2).hex()}.webp"
    f.write_bytes(SRC)
    with db.new_session() as s:
        wk = Work(
            child_id=child_id, template_id="clay", status="ready", file_path=str(f), kind=kind,
            request_id=f"r-{os.urandom(4).hex()}",
        )
        s.add(wk)
        s.commit()
        wid = wk.id
    r = client.post("/api/posts", json={"work_id": wid, "audience": audience})
    assert r.status_code == 200 and r.json()["status"] == "published", r.text
    return r.json()["id"]


def remix(c, pid, rid="remix-req-1", **kw):
    return c.post(f"/api/posts/{pid}/remix", json={"request_id": rid, **kw})


def bal(cid):
    with db.new_session() as s:
        return coins.balance(s, cid)


def work_status(c, wid):
    return c.get(f"/api/works/{wid}").json()


def set_post(pid, **vals):
    with db.new_session() as s:
        p = s.get(Post, pid)
        for k, v in vals.items():
            setattr(p, k, v)
        s.commit()


def test_remix_happy_path(w, fake):
    r = remix(w.b, w.post, template_id="anime", text="a red fox")
    assert r.status_code == 200
    st = work_status(w.b, r.json()["id"])
    assert st["status"] == "ready" and st["image_url"]
    assert fake.gens == []  # не обычная генерация
    src, prompt, user = fake.edits[0]
    assert src == SRC and user == f"child-{w.b_id}"
    assert "a red fox" in prompt and "anime" in prompt
    assert fake.text_calls == ["a red fox"] and fake.img_calls == ["image_result"]
    assert bal(w.b_id) == 19
    # опубликованный ремикс показывает «ремикс работы @ник»
    pid = w.b.post("/api/posts", json={"work_id": st["id"], "audience": "class"}).json()["id"]
    v = w.a.get(f"/api/posts/{pid}").json()
    assert v["remix_of"] == {"post_id": w.post, "nick": "Mila"}
    assert w.a.get(f"/api/posts/{w.post}").json()["remix_of"] is None


def test_remix_text_only_without_template(w, fake):
    wid = remix(w.b, w.post, text="add a hat").json()["id"]
    assert work_status(w.b, wid)["status"] == "ready"
    assert remix(w.b, w.post, rid="remix-req-2").status_code == 422  # ни шаблона, ни текста
    assert remix(w.b, w.post, rid="remix-req-3", template_id="zzz").status_code == 422


@pytest.mark.parametrize("mode", ["refuse", "hold", "support", "unknown", "exception", "timeout"])
def test_text_check_failure_modes_no_edit_no_charge(w, fake, mode):
    if mode == "exception":
        fake.text_exc = RuntimeError("junk json")
    elif mode == "timeout":
        fake.text_exc = ModelTimeout("t")
    else:
        fake.text = D(mode)
    st = work_status(w.b, remix(w.b, w.post, text="что-то").json()["id"])
    assert fake.edits == [] and fake.img_calls == []
    assert bal(w.b_id) == 20 and st["status"] != "ready" and st["image_url"] is None


@pytest.mark.parametrize(
    "exc",
    [ModelTimeout("t"), ModelError("http 500", 500), ModelError("http 429", 429), ValueError("junk")],
)
def test_edit_failure_refunds_and_shows_nothing(w, fake, exc):
    fake.edit_exc = exc
    st = work_status(w.b, remix(w.b, w.post, text="x").json()["id"])
    assert st["status"] == "failed" and st["image_url"] is None
    assert bal(w.b_id) == 20 and fake.img_calls == []


def test_content_policy_refunds_and_holds(w, fake):
    fake.edit_exc = ContentPolicyViolation("cpv", 400)
    st = work_status(w.b, remix(w.b, w.post, text="x").json()["id"])
    assert st["status"] == "refused" and bal(w.b_id) == 20
    with db.new_session() as s:
        assert s.scalar(select(HeldItem.id).where(HeldItem.item_type == "prompt")) is not None


@pytest.mark.parametrize("mode", ["hold", "refuse", "exception", "support"])
def test_unsafe_remix_image_not_shown_and_refunded(w, fake, mode):
    if mode == "exception":
        fake.image_exc = RuntimeError("down")
    else:
        fake.image = D(mode)
    wid = remix(w.b, w.post, text="x").json()["id"]
    st = work_status(w.b, wid)
    assert st["status"] in ("held", "support") and st["image_url"] is None
    assert w.b.get(f"/api/works/{wid}/image").status_code == 404
    assert bal(w.b_id) == 20


def test_double_click_one_work_one_coin(w, fake):
    a = remix(w.b, w.post, rid="same-request-1", text="x").json()
    b = remix(w.b, w.post, rid="same-request-1", text="x").json()
    assert a["id"] == b["id"] and len(fake.edits) == 1 and bal(w.b_id) == 19


def test_no_coins_402(w, fake):
    from app.accounts.models import CoinLedger

    with db.new_session() as s:
        s.add(CoinLedger(child_id=w.b_id, delta=-20, reason="x", ref_id="drain"))
        s.commit()
    assert remix(w.b, w.post, text="x").status_code == 402
    assert fake.edits == []


def test_access_rules(w, fake):
    # чужой класс и без входа
    assert remix(w.z, w.post, text="x").status_code == 404
    assert remix(TestClient(app), w.post, text="x").status_code == 401
    for c in (w.parent, w.teacher):
        assert remix(c, w.post, text="x").status_code == 401
    assert remix(w.b, 9999, text="x").status_code == 404
    # своё нельзя
    assert remix(w.a, w.post, text="x").status_code == 403
    # семейный пост — не класс
    fam = make_post(w, w.a_id, w.a, audience="family")
    assert remix(w.b, fam, text="x").status_code == 404
    assert fake.edits == []


@pytest.mark.parametrize("status", ["held", "pending", "hidden", "deleted", "rejected"])
def test_not_published_post_cannot_be_remixed(w, fake, status):
    set_post(w.post, status=status)
    assert remix(w.b, w.post, text="x").status_code == 404
    assert fake.edits == [] and bal(w.b_id) == 20


def test_best_and_author_ban_forbidden(w, fake):
    set_post(w.post, best=True)
    assert remix(w.b, w.post, text="x").status_code == 403
    set_post(w.post, best=False)
    # автор запрещает; чужой не может переключить
    assert w.b.post(f"/api/posts/{w.post}/remix-allowed", json={"allowed": False}).status_code == 404
    assert w.a.post(f"/api/posts/{w.post}/remix-allowed", json={"allowed": False}).status_code == 200
    assert w.b.get(f"/api/posts/{w.post}").json()["can_remix"] is False
    assert remix(w.b, w.post, text="x").status_code == 403
    assert fake.edits == [] and bal(w.b_id) == 20
    w.a.post(f"/api/posts/{w.post}/remix-allowed", json={"allowed": True})
    assert w.b.get(f"/api/posts/{w.post}").json()["can_remix"] is True
    assert remix(w.b, w.post, rid="remix-req-9", text="x").status_code == 200


def test_post_hidden_while_checking_stops_before_charge(w, fake, monkeypatch):
    """Пост скрыли, пока шла проверка текста: исходник не берём, монета не списана."""
    orig = fake.check_text

    def hide_then_allow(text, kind, lang):
        set_post(w.post, status="hidden")
        return orig(text, kind, lang)

    monkeypatch.setattr(pipeline, "check_text", hide_then_allow)
    st = work_status(w.b, remix(w.b, w.post, text="x").json()["id"])
    assert st["status"] == "failed" and fake.edits == [] and bal(w.b_id) == 20


def test_upload_remix_uses_only_blurred_file_path(w, fake):
    """У загрузки в генерацию уходит file_path (размытая версия), оригинал недоступен ремиксу."""
    blurred = w.tmp / "blur.webp"
    blurred.write_bytes(b"BLURRED")
    original = w.tmp / "orig.jpg"
    original.write_bytes(b"ORIGINAL-FACE")
    with db.new_session() as s:
        wk = Work(
            child_id=w.a_id, kind="upload", template_id="upload", status="ready",
            file_path=str(blurred), request_id="up-req-0001",
        )
        s.add(wk)
        s.commit()
        wid = wk.id
    pid = w.a.post("/api/posts", json={"work_id": wid, "audience": "class"}).json()["id"]
    assert remix(w.b, pid, text="x").status_code == 200
    assert fake.edits[0][0] == b"BLURRED" and b"ORIGINAL" not in fake.edits[0][0]


# ---------------- правки ревью ----------------


def remix_post(w, **kw):
    """Ремикс Tedi по посту Mila, опубликованный в класс: (work_id, post_id)."""
    wid = remix(w.b, w.post, text="x", **kw).json()["id"]
    assert work_status(w.b, wid)["status"] == "ready"
    r = w.b.post("/api/posts", json={"work_id": wid, "audience": "class"})
    assert r.status_code == 200 and r.json()["status"] == "published", r.text
    return wid, r.json()["id"]


def post_status(pid):
    with db.new_session() as s:
        return s.get(Post, pid).status


def test_remix_nick_hidden_from_those_who_cannot_see_source(w, fake):
    _, rp = remix_post(w)
    assert w.a.get(f"/api/posts/{rp}").json()["remix_of"]["nick"] == "Mila"
    # родитель Тэди видит пост ремикса своего ребёнка, но не пост чужой семьи: ника нет
    other_parent = login("parent", "p3@x.io")
    _cid, sister = child_of(other_parent, "Sisi", (6, 10, 4))
    with db.new_session() as s:  # сестра Тэди в другом классе, пост ремикса стал «Лучшим» (видят все)
        s.get(Post, rp).best = True
        s.commit()
    assert sister.get(f"/api/posts/{rp}").status_code == 200
    assert sister.get(f"/api/posts/{rp}").json()["remix_of"] is None
    assert w.z.get(f"/api/posts/{rp}").json()["remix_of"] is None  # чужой класс
    assert other_parent.get(f"/api/posts/{rp}").json()["remix_of"] is None  # посторонний родитель
    assert w.parent.get(f"/api/posts/{rp}").json()["remix_of"]["nick"] == "Mila"  # свой родитель видит


def test_remix_cannot_leave_the_class(w, fake):
    wid = remix(w.b, w.post, text="x").json()["id"]
    r = w.b.post("/api/posts", json={"work_id": wid, "audience": "family"})
    assert (r.status_code, r.json()["detail"]) == (409, "remix_class_only")


def test_publish_blocked_when_source_hidden_while_waiting(w, fake):
    wid = remix(w.b, w.post, text="x").json()["id"]
    assert w.teacher.delete(f"/api/posts/{w.post}").status_code == 200
    r = w.b.post("/api/posts", json={"work_id": wid, "audience": "class"})
    assert (r.status_code, r.json()["detail"]) == (409, "remix_source_gone")


def test_source_hidden_during_generation_never_ready_and_refunded(w, fake, monkeypatch):
    """Исходник скрыли, пока шла генерация: проверка перед ready, работа failed, монета вернулась."""
    orig = fake.edit_image

    def hide_during(source, prompt, user, timeout):
        set_post(w.post, status="hidden")
        return orig(source, prompt, user, timeout)

    monkeypatch.setattr(pipeline, "edit_image", hide_during)
    st = work_status(w.b, remix(w.b, w.post, text="x").json()["id"])
    assert st["status"] == "failed" and st["image_url"] is None
    assert bal(w.b_id) == 20


def test_approved_held_image_of_remix_checks_source(w, fake):
    fake.image = D("hold")
    wid = remix(w.b, w.post, text="x").json()["id"]
    assert work_status(w.b, wid)["status"] == "held" and bal(w.b_id) == 20
    set_post(w.post, status="hidden")
    with db.new_session() as s:
        item = s.scalar(select(HeldItem).where(HeldItem.item_type == "image"))
        assert decide(s, item, True, "parent")
    st = work_status(w.b, wid)
    assert st["status"] == "failed" and st["image_url"] is None and bal(w.b_id) == 20


def test_hiding_source_hides_remixes_in_same_step(w, fake):
    _, rp = remix_post(w)
    assert w.teacher.delete(f"/api/posts/{w.post}").status_code == 200
    assert post_status(rp) == "hidden"
    assert w.a.get("/api/feed/class").json()["items"] == []


def test_rejecting_source_hides_remixes(w, fake):
    _, rp = remix_post(w)
    with db.new_session() as s:  # пост-исходник вернулся на проверку и взрослый отклонил
        s.get(Post, w.post).status = "held"
        hold(s, item_type="post", target_id=w.post, child_id=w.a_id, reviewer="teacher")
        item = s.scalar(select(HeldItem).where(HeldItem.item_type == "post"))
        assert decide(s, item, False, "teacher")
    assert post_status(rp) == "hidden"


def test_author_delete_or_ban_keep_posted_remixes(w, fake):
    _, rp = remix_post(w)
    assert w.a.post(f"/api/posts/{w.post}/remix-allowed", json={"allowed": False}).status_code == 200
    assert post_status(rp) == "published"
    assert w.a.delete(f"/api/posts/{w.post}").status_code == 200
    assert post_status(rp) == "published"


def test_request_id_conflict_other_post(w, fake):
    other = make_post(w, w.a_id, w.a)
    a = remix(w.b, w.post, rid="shared-rid-01", text="x")
    assert a.status_code == 200
    r = remix(w.b, other, rid="shared-rid-01", text="x")
    assert (r.status_code, r.json()["detail"]) == (409, "request_id_conflict")
    assert remix(w.b, w.post, rid="shared-rid-01", text="x").json()["id"] == a.json()["id"]
    assert len(fake.edits) == 1


def test_held_prompt_approved_runs_remix_once_with_source_check(w, fake, monkeypatch):
    fake.text = D("hold")
    wid = remix(w.b, w.post, text="спорное").json()["id"]
    assert work_status(w.b, wid)["status"] == "held" and fake.edits == [] and bal(w.b_id) == 20
    with db.new_session() as s:
        item = s.scalar(select(HeldItem).where(HeldItem.item_type == "prompt"))
        item_id = item.id
        monkeypatch.setattr(pipeline, "spawn", lambda wid_, skip=False: pipeline.run(wid_, skip))
        assert decide(s, item, True, "parent")
    assert work_status(w.b, wid)["status"] == "ready"
    assert len(fake.edits) == 1 and fake.edits[0][0] == SRC and bal(w.b_id) == 19
    assert item_id


def test_held_prompt_approved_after_source_hidden_not_charged(w, fake, monkeypatch):
    fake.text = D("hold")
    wid = remix(w.b, w.post, text="спорное").json()["id"]
    set_post(w.post, status="hidden")
    with db.new_session() as s:
        item = s.scalar(select(HeldItem).where(HeldItem.item_type == "prompt"))
        monkeypatch.setattr(pipeline, "spawn", lambda wid_, skip=False: pipeline.run(wid_, skip))
        decide(s, item, True, "parent")
    st = work_status(w.b, wid)
    assert st["status"] == "failed" and fake.edits == [] and bal(w.b_id) == 20


def test_proposed_then_accept_checks_source_and_charges_once(w, fake):
    fake.text = D("rewrite")
    fake.text.safe_text = "a kind fox"
    wid = remix(w.b, w.post, text="злой лис").json()["id"]
    assert work_status(w.b, wid)["status"] == "proposed" and fake.edits == [] and bal(w.b_id) == 20
    assert w.b.post(f"/api/works/{wid}/accept").status_code == 200
    assert work_status(w.b, wid)["status"] == "ready"
    assert len(fake.edits) == 1 and "a kind fox" in fake.edits[0][1] and "злой" not in fake.edits[0][1]
    assert bal(w.b_id) == 19
    assert w.b.post(f"/api/works/{wid}/accept").status_code == 200  # повтор — no-op
    assert len(fake.edits) == 1 and bal(w.b_id) == 19


def test_proposed_accept_after_source_hidden_not_charged(w, fake):
    fake.text = D("rewrite")
    fake.text.safe_text = "a kind fox"
    wid = remix(w.b, w.post, text="злой лис").json()["id"]
    set_post(w.post, status="hidden")
    w.b.post(f"/api/works/{wid}/accept")
    assert work_status(w.b, wid)["status"] == "failed" and fake.edits == [] and bal(w.b_id) == 20


def test_rejecting_upload_hides_its_remixes(w, fake):
    _, rp = remix_post(w)
    with db.new_session() as s:
        wid = s.get(Post, w.post).work_id
        hold(s, item_type="upload", target_id=wid, child_id=w.a_id, reviewer="parent")
        item = s.scalar(select(HeldItem).where(HeldItem.item_type == "upload"))
        assert decide(s, item, False, "parent")
    assert post_status(rp) == "hidden"
