"""Колокольчик ребёнка: что видит, чего не видит, что считается непрочитанным."""

# ruff: noqa: F401, F811, I001
from sqlalchemy import select

from app import db
from app.moderation import HeldItem, hold

from test_feed import D, _work, fake, fresh_db, w


def notes(c):
    return c.get("/api/child/notifications").json()


def kinds(c):
    return [i["kind"] for i in notes(c)["items"]]


def post(w):
    r = w.a.post("/api/posts", json={"work_id": w.work, "audience": "class"})
    assert r.status_code == 200 or r.status_code == 201, r.text
    return r.json()["id"]


def test_new_task_only_for_own_class_and_gone_after_handing_in(w, fake):
    aid = w.teacher.post(f"/api/teacher/classes/{w.room['id']}/assignments", json={"title": "Кот"}).json()["id"]
    assert kinds(w.a) == ["task"] and notes(w.a)["items"][0]["title"] == "Кот"
    assert notes(w.a)["items"][0]["link"] == f"/create?assignment={aid}"
    assert kinds(w.c) == [] and kinds(w.d) == []
    w.a.post(f"/api/assignments/{aid}/submit", json={"work_id": w.work})
    assert kinds(w.a) == []


def test_reactions_and_comments_counted_without_names_or_text(w, fake):
    pid = post(w)
    assert w.a.put(f"/api/posts/{pid}/reactions/heart").status_code == 200  # своя реакция не новость
    assert kinds(w.a) == []
    w.b.put(f"/api/posts/{pid}/reactions/heart")
    w.b.put(f"/api/posts/{pid}/reactions/star")
    assert w.b.post(f"/api/posts/{pid}/comments", json={"text": "Секретный текст"}).status_code in (200, 201)
    got = {i["kind"]: i for i in notes(w.a)["items"]}
    assert got["reaction"]["count"] == 2 and got["comment"]["count"] == 1
    body = w.a.get("/api/child/notifications").text
    assert "Секретный" not in body and "Tedi" not in body
    assert kinds(w.b) == []  # чужой работы новости не касаются


def test_held_comment_is_not_news(w, fake):
    pid = post(w)
    fake.d = D("hold")
    w.b.post(f"/api/posts/{pid}/comments", json={"text": "плохо"})
    assert kinds(w.a) == []


def _decide(w, status, urgent=False):
    with db.new_session() as s:
        it = hold(s, item_type="upload", target_id=w.work, child_id=w.a_id, reviewer="parent", reason_codes=["x"], urgent=urgent)
        it = s.get(HeldItem, it.id)
        from app import clock

        it.status, it.decided_at = status, clock.now()
        s.commit()


def test_adult_decisions_shown_urgent_never(w, fake):
    _decide(w, "rejected", urgent=True)
    _decide(w, "approved", urgent=True)
    assert kinds(w.a) == []
    _decide(w, "rejected")
    assert kinds(w.a) == ["refused"]
    _decide(w, "approved")
    assert sorted(kinds(w.a)) == ["approved", "refused"]
    assert kinds(w.b) == []


def test_read_clears_unread_new_event_comes_back(w, fake):
    w.teacher.post(f"/api/teacher/classes/{w.room['id']}/assignments", json={"title": "Кот"})
    assert notes(w.a)["unread"] == 1
    assert w.a.post("/api/child/notifications/read").status_code == 200
    n = notes(w.a)
    assert n["unread"] == 0 and n["items"][0]["unread"] is False and len(n["items"]) == 1
    assert notes(w.b)["unread"] == 1  # отметка у каждого своя
    w.teacher.post(f"/api/teacher/classes/{w.room['id']}/assignments", json={"title": "Пёс"})
    assert notes(w.a)["unread"] == 1


def test_only_child_sees(w, fake):
    assert w.teacher.get("/api/child/notifications").status_code in (401, 403)


def clear(c, *keys):
    return c.post("/api/child/notifications/clear", json={"keys": list(keys)})


def test_same_in_a_row_collapse_into_one_row_with_all_keys(w, fake):
    _decide(w, "rejected")
    _decide(w, "rejected")
    _decide(w, "rejected")
    items = notes(w.a)["items"]
    assert [i["kind"] for i in items] == ["refused"] and items[0]["count"] == 3 and len(items[0]["keys"]) == 3
    assert notes(w.a)["unread"] == 1


def test_refusal_shows_no_picture_approval_names_the_work(w, fake):
    _decide(w, "rejected")
    assert notes(w.a)["items"][0]["image_url"] is None
    _decide(w, "approved")
    assert notes(w.a)["items"][0]["image_url"] == f"/api/works/{w.work}/image?thumb=1"


def test_cleared_stays_cleared_and_only_for_this_child(w, fake):
    aid = w.teacher.post(f"/api/teacher/classes/{w.room['id']}/assignments", json={"title": "Кот"}).json()["id"]
    assert clear(w.a, f"task:{aid}").status_code == 200
    assert kinds(w.a) == []
    assert kinds(w.b) == ["task"]  # у одноклассника осталось
    assert w.teacher.post(f"/api/teacher/classes/{w.room['id']}/assignments", json={"title": "Пёс"}).status_code in (200, 201)
    assert [i["title"] for i in notes(w.a)["items"]] == ["Пёс"]  # новое приходит


def test_new_reaction_after_clear_counts_only_new(w, fake):
    pid = post(w)
    w.b.put(f"/api/posts/{pid}/reactions/heart")
    w.b.put(f"/api/posts/{pid}/reactions/star")
    assert notes(w.a)["items"][0]["count"] == 2
    clear(w.a, f"reaction:{pid}")
    assert kinds(w.a) == []
    w.b.put(f"/api/posts/{pid}/reactions/wow")
    got = notes(w.a)["items"]
    assert [i["kind"] for i in got] == ["reaction"] and got[0]["count"] == 1


def test_clear_all_hides_old_lets_new_through(w, fake):
    _decide(w, "rejected")
    w.teacher.post(f"/api/teacher/classes/{w.room['id']}/assignments", json={"title": "Кот"})
    assert clear(w.a, "*").status_code == 200
    n = notes(w.a)
    assert n["items"] == [] and n["unread"] == 0
    _decide(w, "approved")
    assert kinds(w.a) == ["approved"]


def test_clear_does_not_touch_adults_record(w, fake):
    _decide(w, "rejected")
    with db.new_session() as s:
        before = s.scalar(select(HeldItem).where(HeldItem.child_id == w.a_id)).status
    clear(w.a, "*")
    with db.new_session() as s:
        assert s.scalar(select(HeldItem).where(HeldItem.child_id == w.a_id)).status == before


def test_clear_rejects_junk_and_outsiders(w, fake):
    assert clear(w.a, "<script>").status_code == 422
    assert clear(w.a).status_code == 422
    assert clear(w.teacher, "*").status_code in (401, 403)


def test_clear_all_keeps_what_child_has_not_seen_yet(w, fake):
    _decide(w, "rejected")
    shown = notes(w.a)["items"][0]["at"]
    _decide(w, "approved")  # случилось, пока список был открыт
    r = w.a.post("/api/child/notifications/clear", json={"keys": ["*"], "before": shown})
    assert r.status_code == 200
    assert kinds(w.a) == ["approved"]

