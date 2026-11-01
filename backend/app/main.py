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
from app.works.image import pipeline
from app.works.image.router import router as image_router
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


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


MULTIPART_SLACK = 64 * 1024  # поля формы и границы поверх самого файла


@app.middleware("http")
async def limit_upload_body(request: Request, call_next):
    """Тело загрузки не читаем, если оно заведомо больше лимита: проверка размера до чтения."""
    if request.method == "POST" and request.url.path == "/api/works/upload":
        length = request.headers.get("content-length")
        if length is None:
            return JSONResponse({"detail": "length_required"}, status_code=411)
        if not length.isdigit() or int(length) > get_settings().UPLOAD_MAX_BYTES + MULTIPART_SLACK:
            return JSONResponse({"detail": "file_too_large"}, status_code=413)
    return await call_next(request)
