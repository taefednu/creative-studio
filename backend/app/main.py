from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.accounts.router import router as accounts_router
from app.config import get_settings
from app.db import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_settings()  # без ключа и id моделей падаем сразу, с понятной ошибкой
    init_db()
    yield


app = FastAPI(title="Mentorium Creative Studio", lifespan=lifespan)
app.include_router(accounts_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
