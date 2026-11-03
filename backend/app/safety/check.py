"""check_text / check_image: модель классифицирует по строгой схеме, решает код (spec §5)."""

import base64
import logging
from collections.abc import Callable
from functools import lru_cache

from pydantic import ValidationError

from app.meta.client import MetaClient, client_from_settings
from app.safety.models import (
    READABLE_TEXT_SCHEMA,
    REAL_FACE_SCHEMA,
    SCHEMA,
    Classification,
    Decision,
    Kind,
    ReadableText,
    RealFace,
)
from app.safety.policy import Thresholds, decide, hold_error
from app.safety.prompts import (
    image_messages,
    readable_text_messages,
    real_face_messages,
    text_messages,
)

log = logging.getLogger("app.safety")


@lru_cache
def _default_client() -> MetaClient:
    return client_from_settings()


def _thresholds() -> tuple[Thresholds, float]:
    from app.config import get_settings

    s = get_settings()
    return Thresholds(s.ALLOW_THRESHOLD, s.PRESENT_MIN, s.SELF_HARM_MIN), s.SAFETY_TIMEOUT


LANGS = {"ru", "en", "uz"}


def _run(
    messages: list[dict],
    kind: str,
    lang: str,
    client: MetaClient | None,
    recheck: bool,
    original: str | None = None,
) -> Decision:
    """Любое исключение = hold с model_error, никогда allow."""
    if lang not in LANGS:  # lang идёт в задание вне ограждения — только из белого списка
        return hold_error(kind, "invalid_lang")
    try:
        c = client or _default_client()
        th, timeout = _thresholds()
        raw = c.chat_json(messages, SCHEMA, timeout)
        cls = Classification.model_validate_json(raw)  # extra=forbid, строгие типы, [0,1]

        verify: Callable[[str], bool] | None = None
        if recheck:
            sub_kind = "prompt" if kind == "prompt" else "comment"

            def verify(text: str) -> bool:
                # rewrite/kinder проверяются один раз: у проверки recheck=False
                d = _run(text_messages(text, sub_kind, lang), sub_kind, lang, c, False)
                return d.action == "allow"

        return decide(cls, kind, th, verify, original)
    except ValidationError:
        return hold_error(kind, "invalid_response")
    except Exception:  # noqa: BLE001
        return hold_error(kind)


def _log(d: Decision, kind: str, lang: str) -> Decision:
    # текст ребёнка не логируем: только kind, lang, action, категории
    log.info("safety kind=%s lang=%s action=%s categories=%s", kind, lang, d.action, d.categories)
    return d


def check_text(text: str, kind: Kind, lang: str, *, client: MetaClient | None = None) -> Decision:
    try:
        # Сбой не повторяем: он падает почти только на опасное, повтор пропускал его к ребёнку (evals 04.11)
        d = _run(text_messages(text, kind, lang), kind, lang, client, True, text)
    except Exception:  # noqa: BLE001
        d = hold_error(kind)
    return _log(d, kind, lang)


def _mime(b: bytes) -> str:
    if b.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return "image/webp"
    if b[:3] == b"GIF":
        return "image/gif"
    return "image/png"


def _data_url(image_bytes: bytes) -> str:
    return f"data:{_mime(image_bytes)};base64," + base64.b64encode(image_bytes).decode()


def only_drawn_faces(image_bytes: bytes, *, client: MetaClient | None = None) -> bool:
    """True только на явный ответ «настоящих лиц нет». Сбой или мусор — False: лицо размоется."""
    try:
        c = client or _default_client()
        raw = c.chat_json(real_face_messages(_data_url(image_bytes)), REAL_FACE_SCHEMA, _thresholds()[1])
        return not RealFace.model_validate_json(raw).real_face
    except Exception:  # noqa: BLE001
        log.warning("real_face check failed: face stays blurred")
        return False


def no_readable_text(image_bytes: bytes, *, client: MetaClient | None = None) -> bool:
    """True только на явный ответ «букв и цифр нет». Сбой или мусор — False: надпись размоется."""
    try:
        c = client or _default_client()
        raw = c.chat_json(readable_text_messages(_data_url(image_bytes)), READABLE_TEXT_SCHEMA, _thresholds()[1])
        return not ReadableText.model_validate_json(raw).readable_text
    except Exception:  # noqa: BLE001
        log.warning("readable_text check failed: box stays blurred")
        return False


def check_image(
    image_bytes: bytes, kind: Kind, lang: str, *, client: MetaClient | None = None
) -> Decision:
    try:
        url = _data_url(image_bytes)
        d = _run(image_messages(url, kind, lang), kind, lang, client, False)
    except Exception:  # noqa: BLE001
        d = hold_error(kind)
    return _log(d, kind, lang)
