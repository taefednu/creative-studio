from functools import lru_cache

from pydantic import ValidationError
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
