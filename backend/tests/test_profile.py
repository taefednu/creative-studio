"""Профиль ребёнка: ник и картинка на аватарке идут через проверку, сбой и картинка — через взрослого."""

# ruff: noqa: F401, F811, I001
from sqlalchemy import delete, select

from app import db
from app.accounts import nickcheck
from app.accounts.models import Child, ClassMembership
from app.feed.models import Post
from app.moderation import HeldItem
from app.works.image.models import Work

from test_feed import D, _work, fake, fresh_db, w


def me(w):
    with db.new_session() as s:
        c = s.get(Child, w.a_id)
        return c.nick, c.avatar_work_id


def verdict(monkeypatch, d=None, exc=None):
    def check(*a, **k):
        if exc:
            raise exc
        return d

    monkeypatch.setattr(nickcheck, "_check_text", lambda: check)


def allow():
    d = D("allow")
    d.model_error = False
    return d


def failed():
    d = D("hold")
    d.model_error = True
    return d


def held(w, item_type):
    with db.new_session() as s:
        return s.scalar(select(HeldItem).where(HeldItem.child_id == w.a_id, HeldItem.item_type == item_type, HeldItem.status == "pending"))


def test_clean_nick_applies_and_keeps_works(w, fake, monkeypatch):
    verdict(monkeypatch, allow())
    r = w.a.post("/api/child/nick", json={"nick": "NewFox"})
    assert r.status_code == 200 and r.json() == {"status": "ok", "nick": "NewFox"}
    assert w.a.get("/api/child/me").json()["nick"] == "NewFox"
    assert w.a.get(f"/api/works/{w.work}/image").status_code == 200  # работа осталась


def test_taken_and_bad_format_nick_never_reach_model(w, fake, monkeypatch):
    verdict(monkeypatch, exc=AssertionError("модель не нужна"))
    other = w.b.get("/api/child/me").json()["nick"]
    assert w.a.post("/api/child/nick", json={"nick": other}).status_code == 409
    assert w.a.post("/api/child/nick", json={"nick": "a b"}).status_code == 422


def test_unsafe_nick_refused_and_old_stays(w, fake, monkeypatch):
    before = me(w)[0]
    d = D("hold")
    d.model_error = False
    verdict(monkeypatch, d)
    r = w.a.post("/api/child/nick", json={"nick": "tg_kid"})
    assert r.status_code == 422 and r.json()["detail"] == "nick_rejected"
    assert me(w)[0] == before and held(w, "nickname") is None


def test_check_failure_goes_to_adult_never_applies(w, fake, monkeypatch):
    before = me(w)[0]
    for v in ({"d": failed()}, {"exc": RuntimeError("down")}):
        verdict(monkeypatch, **v)
        r = w.a.post("/api/child/nick", json={"nick": "Waiter"})
        if held(w, "nickname") is None:
            raise AssertionError(r.text)
        assert r.json()["status"] == "held" and me(w)[0] == before
        assert w.a.get("/api/child/profile").json()["nick_pending"] == "Waiter"
        with db.new_session() as s:
            s.delete(s.get(HeldItem, held(w, "nickname").id))
            s.commit()


def test_adult_decides_nick_child_is_told(w, fake, monkeypatch):
    verdict(monkeypatch, failed())
    w.a.post("/api/child/nick", json={"nick": "Waiter"})
    assert w.a.post("/api/child/nick", json={"nick": "Second"}).status_code == 409  # один за раз
    it = held(w, "nickname")
    assert w.parent.post(f"/api/review/items/{it.id}/approve").status_code == 200
    assert me(w)[0] == "Waiter"
    kinds = [i["kind"] for i in w.a.get("/api/child/notifications").json()["items"]]
    assert "nickapproved" in kinds


def test_adult_refuses_nick_old_stays(w, fake, monkeypatch):
    before = me(w)[0]
    verdict(monkeypatch, failed())
    w.a.post("/api/child/nick", json={"nick": "Waiter"})
    it = held(w, "nickname")
    assert w.parent.post(f"/api/review/items/{it.id}/reject").status_code == 200
    assert me(w)[0] == before
    kinds = [i["kind"] for i in w.a.get("/api/child/notifications").json()["items"]]
    assert "nickrefused" in kinds


def test_child_without_adult_gets_no_nick_on_failure(w, fake, monkeypatch):
    verdict(monkeypatch, failed())
    with db.new_session() as s:
        s.get(Child, w.a_id).parent_id = None
        s.execute(delete(ClassMembership).where(ClassMembership.child_id == w.a_id))
        s.commit()
    r = w.a.post("/api/child/nick", json={"nick": "Waiter"})
    assert r.status_code == 503 and r.json()["detail"] == "nick_check_failed"


def real_png(w, work_id):
    """Настоящий файл: аватарка отдаётся превью, а его делает PIL."""
    from PIL import Image

    with db.new_session() as s:
        Image.new("RGB", (8, 8), "red").save(s.get(Work, work_id).file_path, "WEBP")


def avatar_of(c, nick):
    return c.get(f"/api/avatars/{nick}", follow_redirects=False)


def test_avatar_shows_only_after_adult_yes(w, fake):
    nick = me(w)[0]
    real_png(w, w.work)
    assert w.a.post("/api/child/avatar-work", json={"work_id": w.work}).status_code == 200
    assert avatar_of(w.b, nick).status_code == 302  # ещё зверёк
    assert w.a.get("/api/child/profile").json()["avatar_pending"] == w.work
    assert w.a.post("/api/child/avatar-work", json={"work_id": w.work}).status_code == 409
    it = held(w, "avatar")
    q = w.parent.get(f"/api/review/items/{it.id}").json()
    assert q["image_url"]  # взрослый видит, что решает
    assert w.parent.post(f"/api/review/items/{it.id}/approve").status_code == 200
    r = avatar_of(w.b, nick)
    assert r.status_code == 200 and r.headers["content-type"] == "image/webp"
    assert me(w)[1] == w.work


def test_guest_never_gets_own_picture(w, fake):
    nick = me(w)[0]
    w.a.post("/api/child/avatar-work", json={"work_id": w.work})
    w.parent.post(f"/api/review/items/{held(w, 'avatar').id}/approve")
    from fastapi.testclient import TestClient

    from app.main import app

    assert avatar_of(TestClient(app), nick).status_code == 302


def test_own_picture_only_for_own_people(w, fake):
    nick = me(w)[0]
    real_png(w, w.work)
    w.a.post("/api/child/avatar-work", json={"work_id": w.work})
    w.parent.post(f"/api/review/items/{held(w, 'avatar').id}/approve")
    for own in (w.a, w.b, w.parent, w.teacher):
        assert avatar_of(own, nick).status_code == 200
    for outsider in (w.c, w.d, w.teacher2, w.parent2):
        assert avatar_of(outsider, nick).status_code == 302


def test_refusal_leaves_animal(w, fake):
    nick = me(w)[0]
    w.a.post("/api/child/avatar-work", json={"work_id": w.work})
    w.parent.post(f"/api/review/items/{held(w, 'avatar').id}/reject")
    assert avatar_of(w.b, nick).status_code == 302 and me(w)[1] is None


def test_later_adult_hide_removes_picture(w, fake):
    nick = me(w)[0]
    w.a.post("/api/child/avatar-work", json={"work_id": w.work})
    w.parent.post(f"/api/review/items/{held(w, 'avatar').id}/approve")
    with db.new_session() as s:
        s.add(Post(work_id=w.work, work_kind="image", child_id=w.a_id, audience="class", status="hidden"))
        s.commit()
    assert avatar_of(w.b, nick).status_code == 302


def test_cannot_use_foreign_upload_or_unfinished_work(w, fake):
    assert w.b.post("/api/child/avatar-work", json={"work_id": w.work}).status_code == 404
    other = _work(w.a_id, w.tmp, status="held")
    assert w.a.post("/api/child/avatar-work", json={"work_id": other}).status_code == 404
    for kind in ("upload", "alive", "page"):  # в них может быть настоящий ребёнок
        up = _work(w.a_id, w.tmp)
        with db.new_session() as s:
            s.get(Work, up).kind = kind
            s.commit()
        assert w.a.post("/api/child/avatar-work", json={"work_id": up}).status_code == 404
        assert up not in [x["id"] for x in w.a.get("/api/child/profile").json()["works"]]
    remix = _work(w.a_id, w.tmp)
    pid = w.a.post("/api/posts", json={"work_id": w.work, "audience": "class"}).json()["id"]
    with db.new_session() as s:
        s.get(Work, remix).remix_of_post_id = pid
        s.commit()
    assert w.a.post("/api/child/avatar-work", json={"work_id": remix}).status_code == 404


def test_approved_then_work_became_ineligible_falls_back(w, fake):
    nick = me(w)[0]
    w.a.post("/api/child/avatar-work", json={"work_id": w.work})
    w.parent.post(f"/api/review/items/{held(w, 'avatar').id}/approve")
    with db.new_session() as s:
        s.get(Work, w.work).status = "refused"
        s.commit()
    assert avatar_of(w.b, nick).status_code == 302
