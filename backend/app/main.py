from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.accounts.router import router as accounts_router
from app.assignments import models as _assignment_models  # noqa: F401  (таблицы)
from app.assignments.router import router as assignments_router
from app.config import get_settings
from app.db import init_db
from app.feed import models as _feed_models  # noqa: F401  (таблицы)
from app.feed.router import router as feed_router
from app.moderation.router import router as moderation_router
from app.parent.router import router as parent_router
from app.voice.router import router as voice_router
from app.works.image import pipeline
from app.works.image.router import router as image_router
from app.works.remix.router import router as remix_router
from app.works.upload.router import router as upload_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_settings()  # без ключа и id моделей падаем сразу, с понятной ошибкой
    init_db()
    pipeline.recover_stuck()  # процесс мог упасть посреди генерации: вернуть монеты
    yield


app = FastAPI(title="Mentorium Creative Studio", lifespan=lifespan)
app.include_router(accounts_router)
app.include_router(image_router)
app.include_router(upload_router)
app.include_router(feed_router)
app.include_router(moderation_router)
app.include_router(assignments_router)
app.include_router(voice_router)
app.include_router(remix_router)
app.include_router(parent_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


MULTIPART_SLACK = 64 * 1024  # поля формы и границы поверх самого файла


@app.middleware("http")
async def limit_upload_body(request: Request, call_next):
    """Тело загрузки не читаем, если оно заведомо больше лимита: проверка размера до чтения."""
    limit, detail = None, ""
    if request.method == "POST":
        if request.url.path == "/api/works/upload":
            limit, detail = get_settings().UPLOAD_MAX_BYTES, "file_too_large"
        elif request.url.path == "/api/voice/transcribe":
            limit, detail = get_settings().VOICE_MAX_BYTES, "audio_too_large"
    if limit is not None:
        length = request.headers.get("content-length")
        # chunked: длины нет или она врёт, лимит не проверить до чтения тела
        if length is None or "transfer-encoding" in request.headers:
            return JSONResponse({"detail": "length_required"}, status_code=411)
        if not length.isdigit() or int(length) > limit + MULTIPART_SLACK:
            return JSONResponse({"detail": detail}, status_code=413)
    return await call_next(request)
