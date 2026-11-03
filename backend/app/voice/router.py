"""Голос (#16): ребёнок говорит, ASR отдаёт текст. Расшифровка сама ничего не запускает:
текст идёт в обычный POST /api/works и проходит ту же проверку. Аудио не храним и не логируем."""

import io
import wave
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.accounts.deps import current_child
from app.accounts.models import Child
from app.config import get_settings
from app.db import get_session
from app.meta.client import ModelTimeout

router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_session)]

LANGS = {"ru": "Russian", "en": "English", "uz": "Uzbek"}
TEXT_MAX = 200  # как длина текста в POST /api/works
_client_cache = None


# Тонкая обёртка: тесты подменяют её поддельной моделью.
def transcribe(wav: bytes, timeout: float, languages: list[str]) -> str:
    global _client_cache
    if _client_cache is None:
        from app.meta.client import client_from_settings

        _client_cache = client_from_settings()
    return _client_cache.transcribe(wav, timeout, languages)


def check_wav(data: bytes) -> float:
    """Длительность в секундах; HTTPException на всё, что ASR не примет."""
    s = get_settings()
    if len(data) > s.VOICE_MAX_BYTES:
        raise HTTPException(413, "audio_too_large")
    try:
        with wave.open(io.BytesIO(data)) as w:
            rate = w.getframerate()
            ok = w.getnchannels() == 1 and w.getsampwidth() == 2 and rate in (16000, 24000)
            declared = w.getnframes()
            actual = len(w.readframes(declared)) // 2  # фактический размер данных, не заголовок
    except (wave.Error, EOFError, ZeroDivisionError, OverflowError):
        raise HTTPException(400, "bad_audio") from None
    # заголовок врёт про длину — длительность по нему не считаем, на ASR такое не уходит
    if not ok or actual <= 0 or actual != declared:
        raise HTTPException(400, "bad_audio")
    seconds = actual / rate
    if seconds > s.VOICE_MAX_SECONDS:
        raise HTTPException(413, "audio_too_long")
    return seconds


@router.post("/voice/transcribe")
def voice_transcribe(
    c: Annotated[Child, Depends(current_child)],
    db: Db,
    audio: Annotated[UploadFile, File()],
    lang: Annotated[str | None, Form()] = None,
):
    s = get_settings()
    data = audio.file.read(s.VOICE_MAX_BYTES + 1)
    check_wav(data)
    # Язык экрана: ребёнок мог сменить его после регистрации, c.lang тогда мешал бы распознаванию
    spoken = LANGS.get(lang or "") or LANGS.get(c.lang)
    # Соединение с БД отдаём до долгого вызова ASR: оно ему не нужно, пул не держим на секунды.
    db.close()
    try:
        text = transcribe(data, s.VOICE_TIMEOUT, [spoken] if spoken else [])
    except ModelTimeout:
        raise HTTPException(504, "asr_timeout") from None
    except Exception:  # noqa: BLE001 — любой сбой ASR: понятный код, текст ребёнка не теряется
        raise HTTPException(502, "asr_failed") from None
    text = " ".join(str(text).split())[:TEXT_MAX]
    if not text:
        raise HTTPException(422, "no_speech")
    return {"text": text}
