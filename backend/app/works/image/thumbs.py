"""Превью картинок для сеток: ленты и «Моих работ». Доступ проверяет вызывающий, до этого кода."""

import io
from functools import lru_cache
from pathlib import Path

from fastapi import Request
from fastapi.responses import Response
from PIL import Image

THUMB_PX = 560  # колонка сетки шириной до ~280 px, вдвое для плотных экранов


# ponytail: кэш в памяти процесса; на диск не кладём, чтобы удалённая работа не оставляла копий
@lru_cache(maxsize=512)
def _thumb(path: str, mtime_ns: int) -> bytes:
    """mtime в ключе: после размытия файл перезаписан, старое превью отдавать нельзя."""
    im = Image.open(path).convert("RGB")
    im.thumbnail((THUMB_PX, THUMB_PX))
    out = io.BytesIO()
    im.save(out, "WEBP", quality=80)
    return out.getvalue()


def thumb_response(path: str, request: Request) -> Response:
    # no-cache: браузер спрашивает каждый раз, доступ уже проверен до ответа; скрытая работа сразу даёт 404
    mtime = Path(path).stat().st_mtime_ns
    headers = {"Cache-Control": "private, no-cache", "ETag": f'"{mtime}"', "Vary": "Cookie"}
    if request.headers.get("if-none-match") == headers["ETag"]:
        return Response(status_code=304, headers=headers)
    return Response(_thumb(path, mtime), media_type="image/webp", headers=headers)
