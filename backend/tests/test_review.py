"""Тикет #9: экран «Задержано». Ловушки из traps.md и тикета."""

# ruff: noqa: F401, F811, I001
import pytest
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app import clock, db
from app.main import app
from app.moderation import HeldItem
from app.feed.models import Post

from test_feed import D, World, _child, _login, _work, comment, fake, fresh_db, held, pub_id, publish, w


def queue(c):
    r = c.get("/api/review/queue")
    assert r.status_code == 200, r.text
    return r.json()


def count(c):
    return c.get("/api/review/count").json()["count"]


def held_post(w, caption="пиши мне в тг @fake_cat_00", codes=("personal_info",)):
    w.fake.d = D("hold", reason_codes=codes)
    return pub_id(w, caption=caption)


def test_queue_teacher_and_count_equals_list(w, fake):
    w.fake = fake
    pid = held_post(w)
    q = queue(w.teacher)
    assert len(q) == 1 and count(w.teacher) == len(q) == 1
    it = q[0]
    assert it["item_type"] == "post" and it["nick"] == "Mila" and it["where"] == "class"
    assert it["reason_codes"] == ["personal_info"] and it["preview_text"] == "пиши мне в тг @fake_cat_00"
    assert it["image_url"] and w.teacher.get(it["image_url"]).status_code == 200
    assert w.b.get("/api/feed/class").json()["items"] == []  # B не видит
    assert pid


def test_two_teachers_isolated(w, fake):
    w.fake = fake
    held_post(w)
    iid = queue(w.teacher)[0]["id"]
    assert queue(w.teacher2) == [] and count(w.teacher2) == 0
    for path in ("", "/image"):
        assert w.teacher2.get(f"/api/review/items/{iid}{path}").status_code == 404
    for act in ("approve", "reject", "seen"):
        assert w.teacher2.post(f"/api/review/items/{iid}/{act}").status_code == 404
    assert queue(w.teacher)[0]["status"] == "pending"


def test_parent_sees_personal_only_own_children_teacher_not(w, fake):
    w.fake = fake
    fake.d = D("hold", reason_codes=["personal_info"])
    pub_id(w, audience="family", caption="подпись")  # личное: родитель
    with db.new_session() as s:
        s.add(HeldItem(item_type="prompt", target_id="1", child_id=w.c_id, reviewer="parent",
                       reason_codes=["personal_info"]))
        s.commit()
    assert len(queue(w.parent)) == 1 and queue(w.parent)[0]["where"] == "family"
    assert len(queue(w.parent2)) == 1 and queue(w.parent2)[0]["nick"] == "Zoya"
    assert queue(w.teacher) == [] and queue(w.teacher2) == []  # учитель не видит личного
    iid = queue(w.parent)[0]["id"]
    assert w.parent2.post(f"/api/review/items/{iid}/approve").status_code == 404
    assert w.teacher.post(f"/api/review/items/{iid}/approve").status_code == 404
    # выложенное в класс чужим ребёнком родитель не видит
    held_post(w)
    assert [i["where"] for i in queue(w.parent)] == ["family"]
    assert queue(w.parent2)[0]["nick"] == "Zoya" and len(queue(w.parent2)) == 1


def test_approve_publishes_idempotent_and_reject_conflict(w, fake):
    w.fake = fake
    pid = held_post(w)
    iid = queue(w.teacher)[0]["id"]
    assert w.teacher.post(f"/api/review/items/{iid}/approve").json()["status"] == "approved"
    assert w.teacher.post(f"/api/review/items/{iid}/approve").json()["status"] == "approved"
    assert w.b.get(f"/api/posts/{pid}").json()["status"] == "published"
    assert w.teacher.post(f"/api/review/items/{iid}/reject").status_code == 409
    assert queue(w.teacher) == [] and count(w.teacher) == 0


def test_reject_then_approve_409_and_child_notice(w, fake):
    w.fake = fake
    pid = held_post(w)
    iid = queue(w.teacher)[0]["id"]
    assert w.teacher.post(f"/api/review/items/{iid}/reject").json()["status"] == "rejected"
    assert w.teacher.post(f"/api/review/items/{iid}/reject").status_code == 200
    assert w.teacher.post(f"/api/review/items/{iid}/approve").status_code == 409
    assert w.b.get("/api/feed/class").json()["items"] == []
    mine = w.a.get("/api/held/mine").json()
    assert [m["item_type"] for m in mine] == ["post"] and mine[0]["text"]
    assert w.b.get("/api/held/mine").json() == []
    assert pid


def test_urgent_comment_both_no_text_in_list_no_approve(w, fake):
    w.fake = fake
    pid = pub_id(w)  # без подписи: опубликован
    fake.d = D("support", urgent=True, reason_codes=["self_harm"])
    assert comment(w.b, pid, "я хочу себя поранить").json()["status"] == "support"
    for who in (w.teacher, w.parent):
        [it] = queue(who)
        assert it["urgent"] and it["preview_text"] is None and it["image_url"] is None
        assert "поранить" not in str(queue(who))
        full = who.get(f"/api/review/items/{it['id']}").json()
        assert full["preview_text"] == "я хочу себя поранить"
        assert who.post(f"/api/review/items/{it['id']}/approve").status_code == 409
    assert w.teacher2.get(f"/api/review/items/{it['id']}").status_code == 404
    assert w.b.get("/api/held/mine").json() == []  # ребёнку «блока» нет
    assert w.teacher.post(f"/api/review/items/{it['id']}/reject").status_code == 409
    # учитель посмотрел днём — родитель вечером всё ещё видит сигнал
    r = w.teacher.post(f"/api/review/items/{it['id']}/seen")
    assert r.json()["status"] == "pending"
    assert queue(w.teacher) == [] and [i["id"] for i in queue(w.parent)] == [it["id"]]
    assert count(w.teacher) == 0 and count(w.parent) == 1
    r = w.parent.post(f"/api/review/items/{it['id']}/seen")
    assert r.json()["status"] == "rejected"
    assert queue(w.parent) == []
    with db.new_session() as s:
        i = s.get(HeldItem, it["id"])
        assert i.decided_by.startswith("parent:")
    assert w.a.get(f"/api/posts/{pid}/comments").json() == []  # ничего не опубликовано
    assert w.teacher.post(f"/api/review/items/{it['id']}/approve").status_code == 409


def test_teacher_gets_urgent_personal_of_class_child_not_plain_personal(w, fake):
    w.fake = fake
    with db.new_session() as s:
        s.add(HeldItem(item_type="prompt", target_id="1", child_id=w.a_id, reviewer="both",
                       urgent=True, reason_codes=["self_harm"]))  # class_id=None
        s.add(HeldItem(item_type="prompt", target_id="2", child_id=w.a_id, reviewer="parent",
                       reason_codes=["personal_info"]))
        s.add(HeldItem(item_type="prompt", target_id="3", child_id=w.c_id, reviewer="both",
                       urgent=True, reason_codes=["self_harm"]))  # ребёнок чужого класса
        s.commit()
    [it] = queue(w.teacher)
    assert it["urgent"] and it["nick"] == "Mila" and it["preview_text"] is None
    assert count(w.teacher) == 1
    assert [i["nick"] for i in queue(w.teacher2)] == ["Zoya"]
    assert len(queue(w.parent)) == 2  # родитель Mila: оба; Zoya — не его
    assert w.teacher.post(f"/api/review/items/{it['id']}/approve").status_code == 409
    assert w.teacher.post(f"/api/review/items/{it['id']}/seen").status_code == 200


def test_seen_only_for_urgent(w, fake):
    w.fake = fake
    held_post(w)
    iid = queue(w.teacher)[0]["id"]
    assert w.teacher.post(f"/api/review/items/{iid}/seen").status_code == 409


def test_order_urgent_first_then_newest(w, fake):
    w.fake = fake
    with db.new_session() as s:
        now = clock.now()
        for n, (urg, age) in enumerate([(False, 5), (True, 9), (False, 1)]):
            s.add(HeldItem(item_type="comment", target_id=str(n), child_id=w.a_id, class_id=w.room["id"],
                           reviewer="both" if urg else "teacher", urgent=urg, created_at=now - timedelta(minutes=age)))
        s.commit()
    assert [(i["urgent"], i["target"] if False else i["id"]) for i in queue(w.teacher)] == [(True, 2), (False, 3), (False, 1)]


def test_no_auto_approve_by_timeout(w, fake):
    w.fake = fake
    pid = held_post(w)
    with db.new_session() as s:
        for i in s.scalars(select(HeldItem)):
            i.created_at = clock.now() - timedelta(days=400)
        s.commit()
    assert count(w.teacher) == 1 and queue(w.teacher)[0]["status"] == "pending"
    assert w.b.get(f"/api/posts/{pid}").status_code == 404
    with db.new_session() as s:
        assert s.get(Post, pid).status == "held"


def test_unauthenticated_and_child_rejected(w):
    assert TestClient(app).get("/api/review/queue").status_code == 401
    assert w.a.get("/api/review/queue").status_code == 401
    assert w.a.get("/api/review/count").status_code == 401


def test_handler_failure_keeps_item_pending(w, fake, monkeypatch):
    from app.moderation import service

    w.fake = fake
    held_post(w)
    iid = queue(w.teacher)[0]["id"]

    def boom(db, item):
        raise RuntimeError("database is locked")

    monkeypatch.setitem(service._registry, "post", service.Handlers(boom, boom))
    with pytest.raises(RuntimeError):
        w.teacher.post(f"/api/review/items/{iid}/approve")
    with db.new_session() as s:
        assert s.get(HeldItem, iid).status == "pending"
