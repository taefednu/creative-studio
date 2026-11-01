import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app


def test_health():
    with TestClient(app) as c:
        assert c.get("/api/health").json() == {"status": "ok"}


def test_no_key_fails_with_clear_error(monkeypatch, tmp_path):
    monkeypatch.delenv("MODEL_API_KEY")
    monkeypatch.chdir(tmp_path)  # чтобы не подхватить backend/.env
    get_settings.cache_clear()
    try:
        with pytest.raises(SystemExit) as ei:
            get_settings()
        assert "MODEL_API_KEY" in str(ei.value)
    finally:
        monkeypatch.setenv("MODEL_API_KEY", "test-key")
        get_settings.cache_clear()


def test_settings_have_no_model_defaults():
    for name in ("MODEL_TEXT", "MODEL_IMAGE", "MODEL_SAM", "MODEL_ASR", "MODEL_API_KEY"):
        assert Settings.model_fields[name].is_required()
