"""Конвейер картинки: проверка текста → монета → генерация → проверка картинки (spec §5, §3).

Модель только классифицирует, решает код. Любой сбой — «на проверку взрослому», не «пропустить».
Картинка ребёнку не отдаётся, пока код не решил allow.
"""

import io
import logging
import threading
from pathlib import Path

from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import db as dbmod
from app.accounts.models import Child
from app.accounts.wallet import recover_platform, wallet_for
from app.config import get_settings
from app.meta.client import ContentPolicyViolation
from app.moderation import hold
from app.works.image.models import Work
from app.works.image.templates import (
    BY_ID,
    build_alive_prompt,
    build_prompt,
    build_remix_prompt,
)
from app.works.remix import source as remix_source
from app.works.story import source as hero_source

log = logging.getLogger("app.works.image")

_client_cache = None


# Тонкие обёртки: тесты подменяют их поддельной моделью.
def check_text(text: str, kind: str, lang: str):
    from app.safety import check_text as f

    return f(text, kind, lang)  # type: ignore[arg-type]


def check_image(data: bytes, kind: str, lang: str):
    from app.safety import check_image as f

    return f(data, kind, lang)  # type: ignore[arg-type]


def generate_image(prompt: str, user: str, timeout: float) -> bytes:
    global _client_cache
    if _client_cache is None:
        from app.meta.client import client_from_settings

        _client_cache = client_from_settings()
    return _client_cache.generate_image(prompt, user, timeout)


def edit_image(source: bytes, prompt: str, user: str, timeout: float) -> bytes:
    global _client_cache
    if _client_cache is None:
        from app.meta.client import client_from_settings

        _client_cache = client_from_settings()
    return _client_cache.edit_image(source, prompt, user, timeout)


def chat_json(messages: list[dict], schema: dict, timeout: float) -> str:
    global _client_cache
    if _client_cache is None:
        from app.meta.client import client_from_settings

        _client_cache = client_from_settings()
    return _client_cache.chat_json(messages, schema, timeout)


def spawn(work_id: int, skip_text_check: bool = False) -> None:
    """Фон вне запроса (одобрение из «Задержано»): поток, чтобы не держать 60 с в ручке."""
    threading.Thread(target=run, args=(work_id, skip_text_check), daemon=True).start()


def upload_path(work_id: int) -> Path:
    return Path(get_settings().UPLOAD_DIR) / f"{work_id}.webp"


def to_webp(data: bytes) -> bytes:
    out = io.BytesIO()
    Image.open(io.BytesIO(data)).convert("RGB").save(out, "WEBP", quality=85)
    return out.getvalue()


def gen_ref(work: Work) -> str:
    return f"gen:{work.id}:{work.attempt}"


def _refund_ref(work: Work) -> str:
    return f"refund:{work.id}:{work.attempt}"


def _refund(db: Session, work: Work) -> None:
    """Возврат ровно один раз: ref_id уникален. Возвращаем, только если списывали. Без commit и без сети."""
    child = db.get(Child, work.child_id)
    if child is not None:
        wallet_for(child).refund_prepare(
            db, child, get_settings().IMAGE_PRICE, gen_ref(work), _refund_ref(work)
        )


def settle_refund(db: Session, work: Work) -> None:
    """Платформенный возврат уходит на платформу только после commit (SQLite не держим открытым)."""
    try:
        child = db.get(Child, work.child_id)
        if child is not None:
            wallet_for(child).refund_settle(db, child, _refund_ref(work))
    except Exception:  # noqa: BLE001 — статус работы (support, held, refused) сбой возврата не меняет
        log.warning("refund settle failed: work=%s", work.id)
        db.rollback()


def refund_once(db: Session, work: Work) -> None:
    _refund(db, work)
    db.commit()
    settle_refund(db, work)


def fail_remix(db: Session, work: Work) -> None:
    """Исходник ремикса пропал: работа failed, монета возвращается (если списана и не возвращена)."""
    _refund(db, work)
    work.reason_codes = ["remix_source_gone"]
    work.status = "failed"
    db.commit()
    settle_refund(db, work)


def _recover_platform() -> None:
    db = dbmod.new_session()
    try:
        recover_platform(db)
    except Exception:  # noqa: BLE001
        log.warning("platform recover failed")
    finally:
        db.close()


def recover_stuck(platform_in_background: bool = False) -> int:
    """При старте: работы, застрявшие в checking/generating (процесс упал), -> failed + возврат.

    Затем повтор недошедших возвратов платформы (refund_pending): не больше одного успешного.
    """
    db = dbmod.new_session()
    try:
        rows = db.scalars(select(Work).where(Work.status.in_(("checking", "generating")))).all()
        for w in rows:
            _refund(db, w)
            w.status = "failed"
        db.commit()
        if platform_in_background:  # платформа может молчать: старту не мешаем
            threading.Thread(target=_recover_platform, daemon=True).start()
        else:
            recover_platform(db)
        return len(rows)
    finally:
        db.close()


def _set(db: Session, work: Work, status: str, codes: list[str] | None = None) -> None:
    work.status = status
    if codes is not None:
        work.reason_codes = codes
    db.commit()


def _codes(d) -> list[str]:
    return list(dict.fromkeys([*d.categories, *d.reason_codes]))


def run(work_id: int, skip_text_check: bool = False) -> None:
    """Фоновая задача. Своя сессия; любое исключение — failed + возврат, не падение потока."""
    db = dbmod.new_session()
    try:
        work = db.get(Work, work_id)
        if work is None:
            return
        try:
            _run(db, work, skip_text_check)
        except Exception:
            log.exception("work %s failed", work_id)
            db.rollback()
            refund_once(db, work)
            _set(db, work, "failed")
    finally:
        db.close()


def _hold_prompt(db: Session, work: Work, codes: list[str], urgent: bool = False) -> None:
    hold(
        db,
        item_type="prompt",
        target_id=work.id,
        child_id=work.child_id,
        reviewer="parent",  # urgent hold() сам поднимает до both
        reason_codes=codes,
        urgent=urgent,
        preview_text=work.child_text,
        commit=False,
    )
    _set(db, work, "held", codes)


def _run(db: Session, work: Work, skip_text_check: bool) -> None:
    s = get_settings()
    child = db.get(Child, work.child_id)
    assert child is not None
    template = BY_ID.get(work.template_id)  # у ремикса без шаблона его нет
    text = work.child_text

    if skip_text_check:  # текст уже проверен кодом или одобрен взрослым
        text = work.rewrite_text or text
    elif text:
        try:
            d = check_text(text, "prompt", child.lang)
        except Exception:  # noqa: BLE001 — сбой проверки = на проверку взрослому
            _hold_prompt(db, work, ["check_failed"])
            return
        codes = _codes(d)
        if d.action == "refuse":
            _set(db, work, "refused", codes)
            return
        if d.action == "support":
            hold(
                db,
                item_type="prompt",
                target_id=work.id,
                child_id=work.child_id,
                reviewer="both",
                reason_codes=codes,
                urgent=True,
                preview_text=text,
                commit=False,
            )
            _set(db, work, "support", codes)
            return
        if d.action == "rewrite" and d.safe_text:
            # ребёнок решает сам: монета не списана, пока он не нажмёт «Рисуем это»
            work.rewrite_text = d.safe_text
            _set(db, work, "proposed", codes)
            return
        if d.action != "allow":  # hold, kinder, что угодно иное — к взрослому
            _hold_prompt(db, work, codes, urgent=bool(getattr(d, "urgent", False)))
            return

    source = None
    if work.remix_of_post_id is not None:
        # Исходник читаем до списания: пост могли скрыть или запретить ремикс, пока шла проверка.
        source = remix_source.load(db, work.remix_of_post_id)
        if source is None:
            _set(db, work, "failed", ["remix_source_gone"])
            return
    elif work.kind == "alive":
        # Герой — размытый file_path своей готовой загрузки, не оригинал.
        source = hero_source.load(db, work.hero_of_work_id, work.child_id, ("upload",))
        if source is None:
            _set(db, work, "failed", ["alive_source_gone"])
            return

    outcome = wallet_for(child).charge(db, child, s.IMAGE_PRICE, "generation", gen_ref(work))
    if outcome != "ok":  # нет монет, платформа молчит или это уже списанная попытка: не генерируем
        code = {
            "no_coins": "no_coins",
            "unavailable": "platform_unavailable",
            "uncertain": "platform_uncertain",  # результат списания неизвестен: не возвращаем
        }.get(outcome)
        if code:
            _set(db, work, "failed", [code])
        else:
            db.rollback()
        return
    if work.kind == "alive":
        work.safe_prompt = build_alive_prompt()
    elif source is not None:
        work.safe_prompt = build_remix_prompt(template, text)
    else:
        assert template is not None
        work.safe_prompt = build_prompt(template, text)
    work.status = "generating"
    db.commit()

    try:
        user = f"child-{child.id}"
        if source is not None:
            raw = edit_image(source, work.safe_prompt, user, s.IMAGE_TIMEOUT)
        else:
            raw = generate_image(work.safe_prompt, user, s.IMAGE_TIMEOUT)
        webp = to_webp(raw)
    except ContentPolicyViolation:
        # возврат, запись в очередь и статус — одним коммитом
        _refund(db, work)
        hold(
            db,
            item_type="prompt",
            target_id=work.id,
            child_id=work.child_id,
            reviewer="parent",
            reason_codes=["content_policy"],
            preview_text=work.child_text,
            commit=False,
        )
        work.reason_codes = ["content_policy"]
        work.status = "refused"
        db.commit()
        settle_refund(db, work)
        return
    except Exception:  # noqa: BLE001 — таймаут, 4xx/5xx, пустой или битый ответ
        refund_once(db, work)
        _set(db, work, "failed")
        return

    path = upload_path(work.id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(webp)
    work.file_path = str(path)
    db.commit()

    try:
        d = check_image(raw, "image_result", child.lang)
        action, codes, urgent = d.action, _codes(d), bool(getattr(d, "urgent", False))
    except Exception:  # noqa: BLE001
        action, codes, urgent = "hold", ["check_failed"], False
    if action == "allow":
        if work.remix_of_post_id is not None and not remix_source.alive(db, work.remix_of_post_id):
            fail_remix(db, work)  # исходник скрыли за время генерации: ребёнку не показываем
            return
        # Загрузку отклонили, пока рисовали героя: отказ взрослого сильнее
        if work.hero_of_work_id is not None:
            up = db.get(Work, work.hero_of_work_id, populate_existing=True)
            if up is None or up.status != "ready":
                _refund(db, work)
                _set(db, work, "refused", ["alive_source_gone"])
                return
        _set(db, work, "ready")
        return
    _refund(db, work)
    both = action == "support" or urgent
    hold(
        db,
        item_type="image",
        target_id=work.id,
        child_id=work.child_id,
        reviewer="both" if both else "parent",
        reason_codes=codes,
        urgent=both,
        commit=False,
    )
    work.reason_codes = codes
    work.status = "support" if both else "held"  # ребёнок видит тёплый ответ, не «ждём»
    db.commit()
    settle_refund(db, work)
