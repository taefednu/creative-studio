"""Конвейер сказки: проверка идеи → монета → Muse Spark пишет → проверка текста → 4 страницы
Muse Image по герою → проверка картинок → готово.

Модель только классифицирует, решает код. Любой сбой или не-allow по любой странице: вся сказка
уходит взрослому (held/support), ребёнок не видит ни одной страницы. Сбой генерации: возврат и failed.
Проверки зовём через модуль image.pipeline (`ip.check_text`...): одна подмена в тестах на всё.
"""

import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import db as dbmod
from app.accounts.models import Child
from app.accounts.wallet import wallet_for
from app.config import get_settings
from app.meta.client import ContentPolicyViolation
from app.moderation import hold
from app.works.image import pipeline as ip
from app.works.image.models import Work
from app.works.story import prompts
from app.works.story import source as hero_source
from app.works.story.models import IN_PROGRESS, PAGES, Story

log = logging.getLogger("app.works.story")


class _Page(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=500)
    scene: str = Field(min_length=1, max_length=600)


class _Draft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=120)
    pages: list[_Page] = Field(min_length=PAGES, max_length=PAGES)


def spawn(story_id: int, skip_idea_check: bool = False) -> None:
    """Фон вне запроса (одобрение из «Задержано»)."""
    threading.Thread(target=run, args=(story_id, skip_idea_check), daemon=True).start()


def _gen_ref(s: Story) -> str:
    return f"story:{s.id}:{s.attempt}"


def _refund_ref(s: Story) -> str:
    return f"story-refund:{s.id}:{s.attempt}"


def _refund(db: Session, s: Story) -> None:
    """Возврат ровно один раз: ref_id уникален; возвращаем, только если списывали. Без commit."""
    child = db.get(Child, s.child_id)
    if child is not None:
        wallet_for(child).refund_prepare(
            db, child, get_settings().STORY_PRICE, _gen_ref(s), _refund_ref(s)
        )


def _settle(db: Session, s: Story) -> None:
    try:
        child = db.get(Child, s.child_id)
        if child is not None:
            wallet_for(child).refund_settle(db, child, _refund_ref(s))
    except Exception:  # noqa: BLE001 — статус сказки сбой возврата не меняет
        log.warning("story refund settle failed: story=%s", s.id)
        db.rollback()


def _fail(db: Session, s: Story, codes: list[str] | None = None) -> None:
    """Возврат и статус одним коммитом."""
    _refund(db, s)
    if codes is not None:
        s.reason_codes = codes
    s.status = "failed"
    db.commit()
    _settle(db, s)


def recover_stuck() -> int:
    """При старте: сказки, застрявшие в работе (процесс упал), -> failed + возврат.

    Зовётся до image.pipeline.recover_stuck: тот потом повторяет недошедшие возвраты платформы.
    """
    db = dbmod.new_session()
    try:
        rows = db.scalars(select(Story).where(Story.status.in_(IN_PROGRESS))).all()
        for s in rows:
            _refund(db, s)
            s.status = "failed"
        db.commit()
        return len(rows)
    finally:
        db.close()


def run(story_id: int, skip_idea_check: bool = False) -> None:
    """Фоновая задача. Своя сессия; любое исключение — failed + возврат, не падение потока."""
    db = dbmod.new_session()
    try:
        s = db.get(Story, story_id)
        if s is None:
            return
        try:
            _run(db, s, skip_idea_check)
        except Exception:
            log.exception("story %s failed", story_id)
            db.rollback()
            _fail(db, s)
    finally:
        db.close()


def _verdict(fn, *args) -> tuple[str, list[str], bool]:
    """('allow'|'hold'|'support', коды, срочно). Исключение = hold, не allow."""
    try:
        d = fn(*args)
        codes = list(dict.fromkeys([*d.categories, *d.reason_codes]))
        urgent = bool(getattr(d, "urgent", False))
        if d.action == "allow":
            return "allow", codes, False
        return ("support" if d.action == "support" or urgent else "hold"), codes, urgent
    except Exception:  # noqa: BLE001
        return "hold", ["check_failed"], False


def _to_adult(db: Session, s: Story, action: str, codes: list[str], status: str | None = None) -> None:
    """Монета назад, запись в очередь и статус — одним коммитом. support: оба взрослых, срочно."""
    _refund(db, s)
    both = action == "support"
    hold(
        db,
        item_type="story",
        target_id=s.id,
        child_id=s.child_id,
        reviewer="both" if both else "parent",
        reason_codes=codes,
        urgent=both,
        preview_text=s.title or s.idea,
        commit=False,
    )
    s.reason_codes = codes
    s.status = status or ("support" if both else "held")  # ребёнок видит тёплый ответ, не «ждём»
    db.commit()
    _settle(db, s)


def _page_path(s: Story, n: int) -> Path:
    return Path(get_settings().UPLOAD_DIR) / "story" / f"{s.id}_{s.attempt}_{n}.webp"


def _worst(verdicts: list[tuple[str, list[str], bool]]) -> tuple[str, list[str]]:
    """Самое тяжёлое из не-allow (support тяжелее hold) и объединённые коды."""
    bad = [v for v in verdicts if v[0] != "allow"]
    action = "support" if any(v[0] == "support" for v in bad) else "hold"
    return action, list(dict.fromkeys(c for v in bad for c in v[1])) or ["held"]


def _run(db: Session, s: Story, skip_idea_check: bool) -> None:
    st = get_settings()
    child = db.get(Child, s.child_id)
    assert child is not None
    hero = hero_source.load(db, s.hero_work_id, s.child_id, ("alive", "image"))
    if hero is None:
        _fail(db, s, ["hero_gone"])
        return

    if s.idea and not skip_idea_check:
        v = _verdict(ip.check_text, s.idea, "prompt", child.lang)
        if v[0] != "allow":  # refuse, rewrite, hold: всё к взрослому, монета ещё не списана
            _to_adult(db, s, v[0], v[1] or ["held"])
            return

    outcome = wallet_for(child).charge(db, child, st.STORY_PRICE, "story", _gen_ref(s))
    if outcome != "ok":  # нет монет, платформа молчит или попытка уже списана: не генерируем
        code = {"no_coins": "no_coins", "unavailable": "platform_unavailable",
                "uncertain": "platform_uncertain"}.get(outcome)
        if code:
            s.reason_codes = [code]
            s.status = "failed"
            db.commit()
        else:
            db.rollback()
        return

    s.status = "writing"
    db.commit()
    draft = _write(s.idea, child.lang, st.STORY_TEXT_TIMEOUT)
    s.title = draft.title
    s.pages = [{"text": p.text, "scene": p.scene, "file": None, "ok": False} for p in draft.pages]
    db.commit()

    # Название и каждая страница проверяются до первой картинки: не-allow — картинок не рисуем.
    texts = [draft.title, *[p.text for p in draft.pages]]
    with ThreadPoolExecutor(len(texts)) as ex:
        verdicts = list(ex.map(lambda t: _verdict(ip.check_text, t, "caption", child.lang), texts))
    if any(v[0] != "allow" for v in verdicts):
        _to_adult(db, s, *_worst(verdicts))
        return

    s.status = "drawing"
    db.commit()
    _draw(db, s, hero, child, st.IMAGE_TIMEOUT)


def _write(idea: str | None, lang: str, timeout: float) -> _Draft:
    """Muse Spark, строгий JSON. Битый ответ — одна повторная попытка, дальше исключение (failed)."""
    last: Exception | None = None
    for _ in range(2):
        raw = ip.chat_json(prompts.messages(idea, lang), prompts.SCHEMA, timeout)
        try:
            return _Draft.model_validate_json(raw)
        except ValueError as e:
            last = e
    raise ValueError("story: invalid model json") from last


def _draw(db: Session, s: Story, hero: bytes, child: Child, timeout: float) -> None:
    def one(n: int, scene: str):
        """В потоке только модель и файл; база — в основном потоке."""
        try:
            raw = ip.edit_image(hero, prompts.page_prompt(scene), f"child-{child.id}", timeout)
            webp = ip.to_webp(raw)
        except ContentPolicyViolation:
            return n, None, ("hold", ["content_policy"], False), True
        path = _page_path(s, n)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(webp)
        return n, str(path), _verdict(ip.check_image, raw, "image_result", child.lang), False

    results: list[tuple[str, list[str], bool]] = []
    policy = False
    error: Exception | None = None
    with ThreadPoolExecutor(PAGES) as ex:
        futs = [ex.submit(one, i + 1, p["scene"]) for i, p in enumerate(s.pages)]
        for f in as_completed(futs):
            try:
                n, path, v, pol = f.result()
            except Exception as e:  # noqa: BLE001 — таймаут, 4xx/5xx, пустой ответ
                error = e
                continue
            results.append(v)
            policy = policy or pol
            pages = [dict(p) for p in s.pages]
            pages[n - 1]["file"] = path
            pages[n - 1]["ok"] = v[0] == "allow"  # страница видна, как только прошла она сама
            s.pages = pages
            db.commit()
    if error is not None:
        raise error
    if any(v[0] != "allow" for v in results):
        action, codes = _worst(results)
        _to_adult(db, s, action, codes, "refused" if policy and action == "hold" else None)
        return
    finish(db, s)


def complete(s: Story) -> bool:
    return len(s.pages) == PAGES and all(p.get("file") and Path(p["file"]).is_file() for p in s.pages)


def finish(db: Session, s: Story) -> None:
    """Все страницы прошли (или взрослый одобрил): обложка-работа и статус ready одним коммитом."""
    s.pages = [{**p, "ok": True} for p in s.pages]
    if s.cover_work_id is None:
        cover = Work(
            child_id=s.child_id,
            kind="page",
            template_id="story",
            status="ready",
            file_path=s.pages[0]["file"],
            request_id=f"story-cover:{s.id}",
        )
        db.add(cover)
        db.flush()
        s.cover_work_id = cover.id
    s.status = "ready"
    db.commit()
