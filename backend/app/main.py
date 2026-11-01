from contextlib import asynccontextmanager

from fastapi import FastAPI

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


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_settings()  # без ключа и id моделей падаем сразу, с понятной ошибкой
    init_db()
    pipeline.recover_stuck()  # процесс мог упасть посреди генерации: вернуть монеты
    yield


app = FastAPI(title="Mentorium Creative Studio", lifespan=lifespan)
app.include_router(accounts_router)
app.include_router(image_router)
app.include_router(feed_router)
app.include_router(moderation_router)
app.include_router(assignments_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
