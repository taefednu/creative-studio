"""Тикет #15: загрузки, SAM 3.1, размытие. Оригинал не доходит до детей ни одной ручкой."""

# ruff: noqa: F401, F811, I001
import io
import json
import os
from pathlib import Path

import httpx
import pytest
from PIL import Image
from sqlalchemy import select

from app import db
from app.config import get_settings
from app.meta.client import MetaClient, ModelError, ModelTimeout
from app.moderation import HeldItem
from app.feed.models import Post
from app.works.image.models import Work
from app.works.upload import pipeline
from app.works.upload.sam import ENTITIES, SamParseError, parse_boxes

from test_feed import D, World, _child, _login, fake, fresh_db, w

REAL = (Path(__file__).parent / "fixtures" / "sam_face_real.txt").read_text()  # живой ответ SAM
PHRASES = {p for p, _ in ENTITIES}


@pytest.fixture(autouse=True)
def upload_dir(tmp_path, monkeypatch, fresh_db):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "up"))
    get_settings.cache_clear()


class FakeSam:
    """Поддельный SAM: тексты по фразе, исключение — на всё."""

    def __init__(self):
        self.texts: dict[str, str] = {}
        self.exc: Exception | None = None
        self.calls: list[str] = []

    def __call__(self, data, phrase, timeout):
        self.calls.append(phrase)
        if self.exc:
            raise self.exc
        return self.texts.get(phrase, "")


class FakeCheck:
    def __init__(self):
        self.d = D("allow")
        self.exc: Exception | None = None
        self.calls: list[str] = []

    def __call__(self, data, kind, lang):
        self.calls.append(kind)
        if self.exc:
            raise self.exc
        return self.d


@pytest.fixture
def sam(monkeypatch):
    f = FakeSam()
    monkeypatch.setattr(pipeline, "sam_call", f)
    return f


@pytest.fixture
def chk(monkeypatch):
    f = FakeCheck()
    monkeypatch.setattr(pipeline, "check_image", f)
    return f


def pic(size=(400, 300), fmt="PNG", exif=None) -> bytes:
    im = Image.frombytes("RGB", size, os.urandom(size[0] * size[1] * 3))  # шум: размытие заметно
    out = io.BytesIO()
    kw = {"exif": exif} if exif else {}
    im.save(out, fmt, **kw)
    return out.getvalue()


def up(c, data=None, name="a.png", rid=None):
    data = data if data is not None else pic()
    return c.post(
        "/api/works/upload",
        files={"file": (name, data, "image/png")},
        data={"request_id": rid} if rid else {},
    )


def work(wid):
    with db.new_session() as s:
        return s.get(Work, wid)


def items(kind="upload"):
    with db.new_session() as s:
        return list(s.scalars(select(HeldItem).where(HeldItem.item_type == kind)))


def good(w, sam, chk, found=("face",)):
    for p, code in ENTITIES:
        if code in found:
            sam.texts[p] = REAL
    r = up(w.a)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---------------- парсер ----------------


def test_parse_real_recorded_answer_scales_to_image():
    [b] = parse_boxes(REAL, (1600, 1600))
    assert b == (302, 284, 831, 666)  # x2/y2 включительно → правая граница не входит
    [half] = parse_boxes(REAL, (800, 800))
    assert half == (151, 142, 416, 333)


def test_parse_empty_is_nothing_found():
    assert parse_boxes("", (10, 10)) == [] and parse_boxes("  \n", (10, 10)) == []


@pytest.mark.parametrize(
    "text",
    ["hello world", REAL[:300], "<0f>0<|box;x1=1;y1=1;x2=5;y2=5;w=10;h=10|>\n", "<0f>garbage\n"],
)
def test_parse_unparsable_is_error(text):
    with pytest.raises(SamParseError):
        parse_boxes(text, (10, 10))


# ---------------- клиент SAM ----------------


def sam_client(monkeypatch, handler):
    calls = []

    def h(request):
        calls.append(json.loads(request.content))
        return handler(request)

    http = httpx.Client(transport=httpx.MockTransport(h))
    monkeypatch.setattr("app.meta.client.httpx.stream", lambda *a, **k: http.stream(*a, **k))
    c = MetaClient("k", "https://fake.test/v1", "t", "t", "t-sam", sleep=lambda s: None)
    return c, calls


def sse(*events):
    return "".join(f"data: {json.dumps(e)}\n\n" for e in events)


DONE = {"type": "response.completed"}


def test_client_reads_deltas_and_sends_confidence(monkeypatch):
    body = sse({"type": "response.output_text.delta", "delta": "ab"},
               {"type": "response.output_text.delta", "delta": "cd"}, DONE)
    c, calls = sam_client(monkeypatch, lambda r: httpx.Response(200, text=body))
    assert c.sam(b"\xff\xd8x", "face", 5) == "abcd"
    assert calls[0]["metadata"] == {"include_confidence": "true"}
    assert calls[0]["input"][0]["content"][1]["image_url"].startswith("data:image/jpeg;base64,")


def test_client_truncated_stream_is_error_not_empty(monkeypatch):
    body = sse({"type": "response.output_text.delta", "delta": "ab"})  # без response.completed
    c, _ = sam_client(monkeypatch, lambda r: httpx.Response(200, text=body))
    with pytest.raises(ModelError):
        c.sam(b"x", "face", 5)


def test_client_empty_completed_is_empty_text(monkeypatch):
    c, _ = sam_client(monkeypatch, lambda r: httpx.Response(200, text=sse(DONE)))
    assert c.sam(b"x", "face", 5) == ""


def test_client_400_not_retried_and_404_status(monkeypatch):
    c, calls = sam_client(monkeypatch, lambda r: httpx.Response(400, json={"error": {"code": "x"}}))
    with pytest.raises(ModelError) as e:
        c.sam(b"x", "face", 5)
    assert e.value.status == 400 and len(calls) == 1
    c, calls = sam_client(monkeypatch, lambda r: httpx.Response(404, json={"error": {"code": "model_not_found"}}))
    with pytest.raises(ModelError) as e:
        c.sam(b"x", "face", 5)
    assert e.value.status == 404 and len(calls) == 1


# ---------------- конвейер ----------------


def test_nothing_found_is_ready_and_published_as_is(w, sam, chk):
    wid = good(w, sam, chk, found=())
    wk = work(wid)
    assert wk.kind == "upload" and wk.status == "ready" and wk.reason_codes == []
    assert set(sam.calls) == PHRASES and len(sam.calls) == len(PHRASES) and chk.calls == ["upload"]
    assert items() == []  # чистая картинка взрослого не беспокоит
    pid = w.a.post("/api/posts", json={"work_id": wid, "audience": "class"}).json()["id"]
    assert w.b.get(f"/api/posts/{pid}/image").status_code == 200


def test_found_is_blurred_and_original_never_served(w, sam, chk, monkeypatch):
    wid = good(w, sam, chk)
    wk = work(wid)
    assert wk.status == "ready" and wk.reason_codes == ["blurred_face"]
    orig = pipeline.original_path(wid).read_bytes()
    shown = Path(wk.file_path).read_bytes()
    assert orig != shown and Path(wk.file_path) != pipeline.original_path(wid)
    # шум в области бокса лица (75,53)-(207,125) на картинке 400x300 после размытия почти исчезает
    from PIL import ImageStat

    def noise(b):
        return ImageStat.Stat(Image.open(io.BytesIO(b)).convert("L").crop((90, 65, 190, 115))).stddev[0]

    assert noise(orig) > 30 and noise(shown) < noise(orig) / 5
    [it] = items()
    assert not it.urgent and it.reviewer == "parent" and it.reason_codes == ["blurred_face"]

    pid = w.a.post("/api/posts", json={"work_id": wid, "audience": "class"}).json()["id"]
    [pit] = [i for i in w.teacher.get("/api/review/queue").json() if i["item_type"] == "post"]
    w.teacher.post(f"/api/review/items/{pit['id']}/approve")  # учитель одобрил, дальше видят все
    aid = w.teacher.post(
        f"/api/teacher/classes/{w.room['id']}/assignments", json={"title": "Тема", "description": "x"}
    ).json()["id"]
    sid = w.a.post(f"/api/assignments/{aid}/submit", json={"work_id": wid}).json()["id"]
    urls = [
        (w.a, f"/api/works/{wid}/image"),
        (w.parent, f"/api/works/{wid}/image"),
        (w.a, f"/api/posts/{pid}/image"),
        (w.b, f"/api/posts/{pid}/image"),  # одноклассник
        (w.teacher, f"/api/posts/{pid}/image"),
        (w.parent, f"/api/posts/{pid}/image"),
        (w.a, f"/api/submissions/{sid}/image"),
        (w.teacher, f"/api/submissions/{sid}/image"),
    ]
    for who, url in urls:
        r = who.get(url)
        assert r.status_code == 200, url
        assert r.content != orig, url
        assert r.content == shown, url
    # посторонние не получают ни оригинал, ни размытую
    for stranger in (w.c, w.d):
        assert stranger.get(f"/api/posts/{pid}/image").status_code == 404
        assert stranger.get(f"/api/works/{wid}/image").status_code == 404


def test_all_four_entities_reasons(w, sam, chk):
    wid = good(w, sam, chk, found=[c for _, c in ENTITIES])
    assert work(wid).reason_codes == [f"blurred_{c}" for _, c in ENTITIES]


BAD_SAM = {
    "timeout": ModelTimeout("t"),
    "http500": ModelError("model http 500", 500),
    "http503": ModelError("model http 503", 503),
    "http400": ModelError("model http 400", 400),
    "model_not_found": ModelError("model http 404", 404),
    "junk": RuntimeError("junk"),
}


@pytest.mark.parametrize("mode", [*BAD_SAM, "garbage_text", "truncated", "box_without_mask"])
def test_sam_failure_holds_and_nothing_published(w, sam, chk, mode, caplog):
    if mode in BAD_SAM:
        sam.exc = BAD_SAM[mode]
    else:
        sam.texts["human face"] = {
            "garbage_text": "I see a face!",
            "truncated": REAL[:300],
            "box_without_mask": "<0f>0<|box;x1=1;y1=1;x2=5;y2=5;w=10;h=10|>\n",
        }[mode]
    r = up(w.a)
    wid = r.json()["id"]
    wk = work(wid)
    assert wk.status == "held" and wk.file_path is None and wk.reason_codes == ["sam_failed"]
    [it] = items()
    assert it.status == "pending" and it.reason_codes == ["sam_failed"]
    assert w.a.post("/api/posts", json={"work_id": wid, "audience": "class"}).status_code == 409
    assert w.a.get(f"/api/works/{wid}/image").status_code == 404
    assert w.b.get(f"/api/works/{wid}/image").status_code == 404
    if mode == "model_not_found":
        assert "model_not_found" in caplog.text


def test_check_not_allow_never_calls_sam(w, sam, chk):
    for action in ("hold", "refuse", "rewrite", "kinder"):
        chk.d = D(action)
        wid = up(w.a).json()["id"]
        assert work(wid).status == "held" and work(wid).file_path is None
    assert sam.calls == []
    assert len(items()) == 4 and not any(i.urgent for i in items())


def test_check_support_is_urgent_both_and_exception_holds(w, sam, chk):
    chk.d = D("support", urgent=True, reason_codes=["self_harm"])
    wid = up(w.a).json()["id"]
    [it] = items()
    assert it.urgent and it.reviewer == "both" and work(wid).status == "support"
    chk.d = D("allow")
    chk.exc = ModelTimeout("t")
    wid2 = up(w.a).json()["id"]
    assert work(wid2).status == "held" and sam.calls == []
    assert w.a.get(f"/api/works/{wid}").json()["reason_codes"] == []  # self_harm ребёнку не отдаём


def test_exif_not_kept(w, sam, chk):
    from PIL import Image as I

    exif = I.Exif()
    exif[0x010F] = "SECRETCAM-GPS-DEVICE"
    wid = good(w, sam, chk, found=())
    # JPEG с метаданными — другой запрос
    sam.calls.clear()
    r = up(w.a, pic(fmt="JPEG", exif=exif.tobytes()), "a.jpg")
    assert r.status_code == 200
    rid = r.json()["id"]
    for p in (pipeline.original_path(rid), Path(work(rid).file_path)):
        raw = p.read_bytes()
        assert b"SECRETCAM" not in raw
        assert not Image.open(io.BytesIO(raw)).getexif()
    assert wid


def test_limits_and_types(w, sam, chk, monkeypatch):
    assert up(w.a, b"not an image at all", "a.png").status_code == 415  # не картинка под видом png
    assert up(w.a, b"", "a.png").status_code == 415
    gif = io.BytesIO()
    Image.new("RGB", (8, 8)).save(gif, "GIF")
    assert up(w.a, gif.getvalue(), "a.png").status_code == 415  # по содержимому, не по имени
    monkeypatch.setenv("UPLOAD_MAX_BYTES", "1000")
    get_settings.cache_clear()
    assert up(w.a, pic()).status_code == 413
    monkeypatch.setenv("UPLOAD_MAX_BYTES", "5000000")
    monkeypatch.setenv("UPLOAD_MAX_PIXELS", "1000")
    get_settings.cache_clear()
    assert up(w.a, pic()).status_code == 413
    assert sam.calls == [] and chk.calls == []
    with db.new_session() as s:  # отказ не оставляет работ
        assert list(s.scalars(select(Work).where(Work.kind == "upload"))) == []
    # без входа и не ребёнок
    assert up(w.parent).status_code in (401, 403)
    from fastapi.testclient import TestClient
    from app.main import app

    assert up(TestClient(app)).status_code == 401


def test_big_image_downscaled_and_formats_ok(w, sam, chk, monkeypatch):
    monkeypatch.setenv("UPLOAD_MAX_SIDE", "100")
    get_settings.cache_clear()
    for fmt in ("PNG", "JPEG", "WEBP"):
        r = up(w.a, pic(fmt=fmt), f"a.{fmt.lower()}")
        assert r.status_code == 200, fmt
        assert max(Image.open(pipeline.original_path(r.json()["id"])).size) == 100


def test_same_request_id_same_work(w, sam, chk):
    a = up(w.a, rid="req-12345678").json()["id"]
    b = up(w.a, rid="req-12345678").json()["id"]
    assert a == b and len(sam.calls) == len(PHRASES)


# ---------------- очередь взрослого ----------------


def test_review_original_and_blurred_only_for_reviewer(w, sam, chk):
    wid = good(w, sam, chk)
    [it] = items()
    d = w.parent.get(f"/api/review/items/{it.id}").json()
    assert d["item_type"] == "upload" and d["original_url"] and d["blurred_url"]
    orig = w.parent.get(d["original_url"]).content
    blur = w.parent.get(d["blurred_url"]).content
    assert orig == pipeline.original_path(wid).read_bytes() and blur != orig
    assert w.parent.get(f"/api/review/items/{it.id}/image").content == blur  # по умолчанию — размытая
    assert w.parent.get(f"/api/review/items/{it.id}/image?version=zzz").status_code == 422
    for stranger in (w.parent2, w.teacher, w.teacher2):
        for suffix in ("", "/image", "/image?version=original"):
            assert stranger.get(f"/api/review/items/{it.id}{suffix}").status_code == 404
    for kid in (w.a, w.b, w.c):
        assert kid.get(f"/api/review/items/{it.id}/image?version=original").status_code == 401


def test_review_reject_refuses_and_hides_posts(w, sam, chk):
    wid = good(w, sam, chk)
    pid = w.a.post("/api/posts", json={"work_id": wid, "audience": "family"}).json()["id"]
    assert w.b.get(f"/api/posts/{pid}/image").status_code == 200
    [it] = items()
    assert w.parent.post(f"/api/review/items/{it.id}/reject").json()["status"] == "rejected"
    assert work(wid).status == "refused"
    assert w.b.get(f"/api/posts/{pid}/image").status_code == 404
    assert w.a.post("/api/posts", json={"work_id": wid, "audience": "family"}).status_code == 409


def test_review_approve_blurred_keeps_ready(w, sam, chk):
    wid = good(w, sam, chk)
    [it] = items()
    assert w.parent.post(f"/api/review/items/{it.id}/approve").json()["status"] == "approved"
    assert work(wid).status == "ready"


def test_approve_held_reruns_sam_not_publishes_original(w, sam, chk, monkeypatch):
    chk.d = D("hold", reason_codes=["unsafe_content"])
    sam.texts["human face"] = REAL
    wid = up(w.a).json()["id"]
    assert work(wid).status == "held" and sam.calls == []
    monkeypatch.setattr(pipeline, "spawn", lambda i, skip=False: pipeline.run(i, skip))
    chk.calls.clear()
    [it] = items()
    assert w.parent.post(f"/api/review/items/{it.id}/approve").json()["status"] == "approved"
    wk = work(wid)
    assert wk.status == "ready" and chk.calls == []  # проверка картинки не повторяется
    assert Path(wk.file_path).read_bytes() != pipeline.original_path(wid).read_bytes()
    assert w.a.get(f"/api/works/{wid}/image").content != pipeline.original_path(wid).read_bytes()
    # SAM упал при повторе → снова на проверку, не публикация
    sam.exc = ModelTimeout("t")
    chk.d = D("hold")
    wid2 = up(w.a).json()["id"]
    [it2] = [i for i in items() if i.target_id == str(wid2)]
    w.parent.post(f"/api/review/items/{it2.id}/approve")
    assert work(wid2).status == "held" and work(wid2).file_path is None


# ---------------- правки ревью ----------------


def test_self_harm_upload_stays_support_after_both_adults_seen(w, sam, chk):
    chk.d = D("support", urgent=True, reason_codes=["self_harm"])
    wid = up(w.a).json()["id"]
    [it] = items()
    v = w.a.get(f"/api/works/{wid}").json()
    assert v["status"] == "support" and v["reason_codes"] == [] and v["image_url"] is None
    assert w.parent.post(f"/api/review/items/{it.id}/seen").json()["status"] == "pending"
    assert w.teacher.post(f"/api/review/items/{it.id}/seen").json()["status"] == "rejected"
    assert work(wid).status == "support"  # не «отказ»: ребёнок остаётся на тёплом ответе
    assert w.a.get("/api/held/mine").json() == []


def class_post(w, wid, caption=None):
    r = w.a.post("/api/posts", json={"work_id": wid, "audience": "class", "caption": caption})
    assert r.status_code == 200, r.text
    return r.json()


def test_class_post_of_blurred_upload_waits_for_teacher(w, sam, chk):
    wid = good(w, sam, chk)
    calls = len(chk.calls)
    p = class_post(w, wid)
    assert p["status"] == "held" and len(chk.calls) == calls
    pid = p["id"]
    assert w.b.get(f"/api/posts/{pid}").status_code == 404
    assert w.b.get("/api/feed/class").json()["items"] == []
    [it] = [i for i in w.teacher.get("/api/review/queue").json() if i["item_type"] == "post"]
    assert it["original_url"] and it["blurred_url"] and it["reason_codes"] == ["blurred_face"]
    orig = w.teacher.get(it["original_url"]).content
    blur = w.teacher.get(it["blurred_url"]).content
    assert orig == pipeline.original_path(wid).read_bytes() and orig != blur
    assert w.teacher2.get(f"/api/review/items/{it['id']}/image?version=original").status_code == 404
    assert w.b.get(f"/api/review/items/{it['id']}/image?version=original").status_code == 401
    assert w.teacher.post(f"/api/review/items/{it['id']}/approve").json()["status"] == "approved"
    r = w.b.get(f"/api/posts/{pid}/image")
    assert r.status_code == 200 and r.content == Path(work(wid).file_path).read_bytes()
    assert r.content != orig


def test_clean_upload_and_family_post_publish_at_once(w, sam, chk):
    wid = good(w, sam, chk, found=())
    assert class_post(w, wid)["status"] == "published"
    wid2 = good(w, sam, chk)
    r = w.a.post("/api/posts", json={"work_id": wid2, "audience": "family"})
    assert r.json()["status"] == "published"


def test_upload_body_checked_before_reading(w, sam, chk):
    big = get_settings().UPLOAD_MAX_BYTES + 100_000
    r = w.a.post("/api/works/upload", content=b"x" * big, headers={"content-type": "multipart/form-data; boundary=b"})
    assert r.status_code == 413
    r = w.a.post(
        "/api/works/upload",
        content=iter([b"--b\r\n"]),  # без Content-Length (chunked)
        headers={"content-type": "multipart/form-data; boundary=b"},
    )
    assert r.status_code == 411
    assert up(w.a).status_code == 200


def test_publish_rechecks_work_after_caption_check(w, fake, monkeypatch):
    def judge(text, kind, lang):
        with db.new_session() as s:  # пока идёт проверка подписи, взрослый отклонил работу
            s.get(Work, w.work).status = "refused"
            s.commit()
        return D("allow")

    monkeypatch.setattr("app.feed.service.check_text", judge)
    r = w.a.post("/api/posts", json={"work_id": w.work, "audience": "class", "caption": "привет"})
    assert r.status_code == 409
    with db.new_session() as s:
        assert list(s.scalars(select(Post))) == []


def test_rejected_upload_in_held_mine_and_removed_from_assignment(w, sam, chk):
    wid = good(w, sam, chk)
    aid = w.teacher.post(
        f"/api/teacher/classes/{w.room['id']}/assignments", json={"title": "Тема", "description": "x"}
    ).json()["id"]
    sid = w.a.post(f"/api/assignments/{aid}/submit", json={"work_id": wid}).json()["id"]
    assert len(w.teacher.get(f"/api/teacher/assignments/{aid}/submissions").json()) == 1
    [it] = items()
    assert w.parent.post(f"/api/review/items/{it.id}/reject").json()["status"] == "rejected"
    assert w.teacher.get(f"/api/teacher/assignments/{aid}/submissions").json() == []
    assert w.teacher.post(f"/api/teacher/submissions/{sid}/show-in-feed").status_code == 409
    assert w.a.get("/api/held/mine").json() == [
        {"id": it.id, "item_type": "upload", "text": None}
    ]
