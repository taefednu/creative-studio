"""Конвейер загрузки (#15): тип и лимиты → check_image → SAM по 4 сущностям → размытие.

Файлы работы: `file_path` — то, что видят дети (размытая версия или чистая, если SAM ничего не
нашёл); оригинал лежит отдельно (`original_path`) и читается только проверяющим взрослым.
Любой сбой — «на проверку взрослому» (held), публикации нет. Монета не списывается.
"""

import io
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageOps
from sqlalchemy.orm import Session

from app import db as dbmod
from app.accounts.models import Child
from app.config import get_settings
from app.meta.client import ModelError
from app.moderation import hold
from app.works.image.models import Work
from app.works.image.pipeline import upload_path
from app.works.upload.sam import ENTITIES, Box, blur, parse_boxes

log = logging.getLogger("app.works.upload")

ALLOWED_FORMATS = ("PNG", "JPEG", "WEBP")
_client_cache = None


class UploadError(Exception):
    def __init__(self, status: int, code: str):
        super().__init__(code)
        self.status, self.code = status, code


def original_path(work_id: int) -> Path:
    return Path(get_settings().UPLOAD_DIR) / "orig" / f"{work_id}.webp"


# Тонкие обёртки: тесты подменяют их поддельной моделью.
def check_image(data: bytes, kind: str, lang: str):
    from app.safety import check_image as f

    return f(data, kind, lang)  # type: ignore[arg-type]


def only_drawn_faces(data: bytes) -> bool:
    from app.safety.check import only_drawn_faces as f

    return f(data)


def sam_call(data: bytes, phrase: str, timeout: float) -> str:
    global _client_cache
    if _client_cache is None:
        from app.meta.client import client_from_settings

        _client_cache = client_from_settings()
    return _client_cache.sam(data, phrase, timeout)


def spawn(work_id: int, skip_check: bool = False) -> None:
    threading.Thread(target=run, args=(work_id, skip_check), daemon=True).start()


# ---- приём файла ----


def normalize(data: bytes) -> Image.Image:
    """Тип по содержимому, лимиты, перекодирование без метаданных. UploadError на любой отказ."""
    s = get_settings()
    if len(data) > s.UPLOAD_MAX_BYTES:
        raise UploadError(413, "file_too_large")
    try:
        im = Image.open(io.BytesIO(data))
        fmt, (w, h) = im.format, im.size
    except Exception:  # noqa: BLE001 — не картинка под видом png, бомба распаковки
        raise UploadError(415, "unsupported_type") from None
    if fmt not in ALLOWED_FORMATS:
        raise UploadError(415, "unsupported_type")
    if w * h > s.UPLOAD_MAX_PIXELS:
        raise UploadError(413, "image_too_large")
    try:
        im = ImageOps.exif_transpose(im)
        im.load()
        rgba = im.convert("RGBA")
        flat = Image.new("RGB", rgba.size, "white")  # новое изображение: EXIF и прочее не переносится
        flat.paste(rgba, mask=rgba.getchannel("A"))
    except Exception:  # noqa: BLE001
        raise UploadError(415, "unsupported_type") from None
    flat.thumbnail((s.UPLOAD_MAX_SIDE, s.UPLOAD_MAX_SIDE), Image.Resampling.LANCZOS)
    return flat


def to_webp(im: Image.Image) -> bytes:
    out = io.BytesIO()
    im.save(out, "WEBP", quality=90)
    return out.getvalue()


def to_jpeg(im: Image.Image) -> bytes:
    out = io.BytesIO()
    im.save(out, "JPEG", quality=92)
    return out.getvalue()


def save_original(work_id: int, im: Image.Image) -> None:
    p = original_path(work_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(to_webp(im))


# ---- фон ----


def _codes(d) -> list[str]:
    return list(dict.fromkeys([*d.categories, *d.reason_codes]))


def _hold(db: Session, work: Work, codes: list[str], urgent: bool = False) -> None:
    hold(
        db,
        item_type="upload",
        target_id=work.id,
        child_id=work.child_id,
        reviewer="parent",  # urgent hold() сам поднимает до both
        reason_codes=codes,
        urgent=urgent,
        commit=False,
    )
    work.reason_codes = codes
    work.status = "support" if urgent else "held"
    db.commit()


def detect(jpeg: bytes, size: tuple[int, int]) -> dict[str, list[Box]]:
    """Один запрос на сущность, параллельно. Любая ошибка — исключение наверх (fail closed)."""
    timeout = get_settings().SAM_TIMEOUT

    def one(e: tuple[str, str]) -> list[Box]:
        return parse_boxes(sam_call(jpeg, e[0], timeout), size)

    with ThreadPoolExecutor(len(ENTITIES)) as pool:
        results = list(pool.map(one, ENTITIES))
    return {code: boxes for (_, code), boxes in zip(ENTITIES, results, strict=True)}


def _log_sam_failure(e: Exception) -> None:
    status = getattr(e, "status", None)
    if isinstance(e, ModelError) and status == 404:
        log.error("SAM model_not_found (404): check MODEL_SAM and model access; upload held")
    else:
        log.error("SAM failed: %s status=%s; upload held", type(e).__name__, status)


def _run(db: Session, work: Work, skip_check: bool) -> None:
    s = get_settings()
    child = db.get(Child, work.child_id)
    assert child is not None
    try:
        im = Image.open(original_path(work.id))
        im.load()
    except Exception:  # noqa: BLE001
        _hold(db, work, ["check_failed"])
        return
    jpeg = to_jpeg(im)

    if not skip_check:  # skip — взрослый уже одобрил оригинал, остаётся SAM
        try:
            d = check_image(jpeg, "upload", child.lang)
            action, codes, urgent = d.action, _codes(d), bool(getattr(d, "urgent", False))
        except Exception:  # noqa: BLE001
            action, codes, urgent = "hold", ["check_failed"], False
        if action != "allow":
            _hold(db, work, codes or ["held"], urgent or action == "support")
            return  # SAM не зовём: картинка и так ждёт взрослого

    try:
        found = detect(jpeg, im.size)
    except Exception as e:  # noqa: BLE001 — таймаут, 4xx/5xx, 404, мусор в ответе
        _log_sam_failure(e)
        _hold(db, work, ["sam_failed"])
        return

    # Рожица на рисунке не личные данные, а размытие лишает героя сходства. Лицо на фото размывается всегда
    if found["face"] and only_drawn_faces(jpeg):
        found["face"] = []
    boxes = [b for bs in found.values() for b in bs]
    out = blur(im, boxes, s.BLUR_PAD) if boxes else im
    path = upload_path(work.id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(to_webp(out))
    work.file_path = str(path)
    if boxes:
        # Детям доступна только размытая версия. Взрослый видит оригинал и размытую и может отклонить.
        codes = [f"blurred_{c}" for c, bs in found.items() if bs]
        hold(
            db,
            item_type="upload",
            target_id=work.id,
            child_id=work.child_id,
            reviewer="parent",
            reason_codes=codes,
            commit=False,
        )
        work.reason_codes = codes
    work.status = "ready"
    db.commit()


def run(work_id: int, skip_check: bool = False) -> None:
    """Фоновая задача со своей сессией. Неожиданное исключение — held, а не публикация."""
    db = dbmod.new_session()
    try:
        work = db.get(Work, work_id)
        if work is None:
            return
        try:
            _run(db, work, skip_check)
        except Exception:
            log.exception("upload %s failed", work_id)
            db.rollback()
            work.file_path = None
            try:
                _hold(db, work, ["check_failed"])
            except Exception:  # noqa: BLE001
                db.rollback()
                work.status = "failed"
                db.commit()
    finally:
        db.close()
