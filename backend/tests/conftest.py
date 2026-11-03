"""Поддельная Meta Model API: режимы из тикета #1 п.4. Только для тестов."""

import json
import os

import httpx
import pytest

os.environ.setdefault("MODEL_API_KEY", "test-key")
os.environ.setdefault("MODEL_TEXT", "t-text")
os.environ.setdefault("MODEL_IMAGE", "t-image")
os.environ.setdefault("MODEL_SAM", "t-sam")
os.environ.setdefault("MODEL_ASR", "t-asr")
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from app.meta.client import MetaClient

VALID = {"verdict": "allow", "category": "safe", "confidence": 0.99}

MODES = [
    "valid",
    "garbage_json",
    "extra_key",
    "unknown_category",
    "empty",
    "content_policy",
    "http_429",
    "http_500",
    "http_503",
    "timeout",
]


def _chat(content: str) -> dict:
    return {
        "id": "x",
        "object": "chat.completion",
        "created": 0,
        "model": "t-text",
        "choices": [
            {"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": content}}
        ],
    }


class FakeMeta:
    """Подменяет сеть: handler(request) -> Response. Считает вызовы в .calls."""

    def __init__(self, mode: str):
        self.mode = mode
        self.calls = 0

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        m = self.mode
        if m == "timeout":
            raise httpx.ReadTimeout("t", request=request)
        if m == "http_429":
            return httpx.Response(429, headers={"Retry-After": "0"}, json={"error": {"code": "rate"}})
        if m == "http_503":
            return httpx.Response(503, json={"error": {"code": "unavailable"}})
        if m == "http_500":
            return httpx.Response(500, json={"error": {"code": "server"}})
        if m == "content_policy":
            err = {"code": "content_policy_violation", "message": "no"}
            return httpx.Response(400, json={"error": err})
        content = {
            "valid": json.dumps(VALID),
            "garbage_json": "{not json",
            "extra_key": json.dumps({**VALID, "extra": 1}),
            "unknown_category": json.dumps({**VALID, "category": "zzz"}),
            "empty": "",
        }[m]
        return httpx.Response(200, json=_chat(content))


@pytest.fixture(params=MODES)
def fake_mode(request):
    return request.param


def make_client(mode: str) -> tuple[MetaClient, FakeMeta, list[float]]:
    fake = FakeMeta(mode)
    sleeps: list[float] = []
    c = MetaClient("k", "https://fake.test/v1", "t-text", "t-image", "t-sam", sleep=sleeps.append)
    c._sdk = c._sdk.with_options(http_client=httpx.Client(transport=httpx.MockTransport(fake.handler)))
    return c, fake, sleeps


@pytest.fixture
def fake_client():
    return make_client


@pytest.fixture(autouse=True)
def _no_background_translation(monkeypatch):
    # Перевод задания идёт в фоне к настоящей модели: его тесты зовут run() сами
    from app.assignments import translate

    monkeypatch.setattr(translate, "spawn", lambda assignment_id: None)
