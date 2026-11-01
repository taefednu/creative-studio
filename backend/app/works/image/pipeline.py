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
from app.accounts import coins
from app.accounts.models import Child
from app.config import get_settings
from app.meta.client import ContentPolicyViolation
from app.moderation import hold
from app.works.image.models import Work
from app.works.image.templates import BY_ID, build_prompt

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


def _refund(db: Session, work: Work) -> None:
    """Возврат ровно один раз: ref_id уникален. Возвращаем, только если списывали. Без commit."""
    if coins.has_entry(db, gen_ref(work)):
        coins.add_entry(
            db, work.child_id, get_settings().IMAGE_PRICE, "refund", f"refund:{work.id}:{work.attempt}"
        )


def refund_once(db: Session, work: Work) -> None:
    _refund(db, work)
    db.commit()


def recover_stuck() -> int:
    """При старте: работы, застрявшие в checking/generating (процесс упал), → failed + возврат."""
    db = dbmod.new_session()
    try:
        rows = db.scalars(select(Work).where(Work.status.in_(("checking", "generating")))).all()
        for w in rows:
            _refund(db, w)
            w.status = "failed"
        db.commit()
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
    template = BY_ID[work.template_id]
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

    outcome = coins.charge(db, child.id, s.IMAGE_PRICE, "generation", gen_ref(work))
    if outcome != "ok":  # нет монет или это уже списанная попытка: не генерируем
        if outcome == "no_coins":
            _set(db, work, "failed", ["no_coins"])
        else:
            db.rollback()
        return
    work.safe_prompt = build_prompt(template, text)
    work.status = "generating"
    db.commit()

    try:
        raw = generate_image(work.safe_prompt, f"child-{child.id}", s.IMAGE_TIMEOUT)
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
    work.status = "held"
    db.commit()
