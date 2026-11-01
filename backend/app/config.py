from functools import lru_cache

from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    MODEL_API_KEY: str
    MODEL_TEXT: str
    MODEL_IMAGE: str
    MODEL_SAM: str
    MODEL_ASR: str
    META_BASE_URL: str = "https://api.meta.ai/v1"
    DATABASE_URL: str = "sqlite:///data/studio.db"
    # Проверка безопасности (spec §5). Подбираются только на dev-части evals.
    SAFETY_TIMEOUT: float = 8.0
    ALLOW_THRESHOLD: float = 0.8  # «категории нет» принимаем, только если уверенность не ниже
    PRESENT_MIN: float = 0.5  # «категория есть» ниже этого — серая зона, hold
    SELF_HARM_MIN: float = 0.2  # self_harm выше этого — support (лучше лишний сигнал)
    # Картинки (#6). Цена и таймаут — конфиг (spec §3).
    IMAGE_PRICE: int = 1
    IMAGE_TIMEOUT: float = 60.0
    UPLOAD_DIR: str = "data/uploads"
    # Аккаунты (#4). Секрет подписи сессий — только из env.
    SESSION_SECRET: str = Field(min_length=32)  # пустой ключ = любой подделает cookie
    SESSION_DAYS: int = 30
    COOKIE_SECURE: bool = False  # True на https-проде
    COIN_START: int = 20
    COIN_DAILY: int = 5
    COIN_CAP: int = 20
    LOGIN_FAILS_MAX: int = 5
    LOGIN_LOCK_MINUTES: int = 15
    QR_TTL_MINUTES: int = 5
    CODE_FAILS_MAX: int = 10
    CODE_FAILS_WINDOW_MINUTES: int = 15


@lru_cache
def get_settings() -> Settings:
    try:
        return Settings()  # type: ignore[call-arg]
    except ValidationError as e:
        names = ", ".join(str(err["loc"][0]) for err in e.errors())
        # значения в сообщение не попадают: ключ не должен утечь в лог
        raise SystemExit(
            f"Не заданы обязательные переменные окружения: {names}. "
            "Скопируй backend/.env.example в backend/.env и заполни."
        ) from None
