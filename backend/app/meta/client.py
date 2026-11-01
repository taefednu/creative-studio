"""Тонкая обёртка над OpenAI SDK для Meta Model API. Ретраи свои (бриф §4), SDK без ретраев."""

import base64
import json
import random
import time
from collections.abc import Callable
from typing import Any

import httpx
import openai
from openai import OpenAI

MAX_RETRIES = 2
BACKOFF_BASE = 0.5


class ModelError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class ModelTimeout(ModelError):
    pass


class ContentPolicyViolation(ModelError):
    code = "content_policy_violation"


def _sniff_mime(b: bytes) -> str:
    if b.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return "image/webp"
    return "image/png"


class _HttpStatus(Exception):
    """Ошибка HTTP из прямого httpx-вызова (SAM), по форме как у SDK."""

    def __init__(self, resp: httpx.Response):
        self.status_code = resp.status_code
        self.response = resp
        try:
            self.code = resp.json().get("error", {}).get("code")
        except Exception:  # noqa: BLE001
            self.code = None
        super().__init__(f"http {resp.status_code}")


def _retry_after(headers: Any) -> float | None:
    try:
        return float(headers.get("retry-after"))
    except (TypeError, ValueError, AttributeError):
        return None


def _convert(e: Exception) -> ModelError:
    if isinstance(e, openai.APITimeoutError | httpx.TimeoutException):
        return ModelTimeout("model timeout")
    status = getattr(e, "status_code", None)
    if status is not None:
        if status == 400 and getattr(e, "code", None) == "content_policy_violation":
            return ContentPolicyViolation("content_policy_violation", 400)
        return ModelError(f"model http {status}", status)
    return ModelError(f"model call failed: {type(e).__name__}")


class MetaClient:
    def __init__(
        self,
        api_key: str,
        base_url: str,
        text_model: str,
        image_model: str,
        sam_model: str,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self._sdk = OpenAI(base_url=base_url, api_key=api_key, max_retries=0)
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self.text_model = text_model
        self.image_model = image_model
        self.sam_model = sam_model
        self._sleep = sleep

    def _call(self, fn: Callable[[], Any]) -> Any:
        attempt = 0
        while True:
            try:
                return fn()
            except Exception as e:  # noqa: BLE001
                status = getattr(e, "status_code", None)
                if status in (429, 503) and attempt < MAX_RETRIES:
                    ra = _retry_after(getattr(getattr(e, "response", None), "headers", None))
                    delay = ra if ra is not None else BACKOFF_BASE * 2**attempt
                    self._sleep(delay + random.uniform(0, 0.25))
                    attempt += 1
                    continue
                raise _convert(e) from None

    def list_models(self, timeout: float = 30) -> list[str]:
        r = self._call(lambda: self._sdk.models.list(timeout=timeout))
        return [m.id for m in r.data]

    def chat_json(self, messages: list[dict], schema: dict, timeout: float) -> str:
        r = self._call(
            lambda: self._sdk.chat.completions.create(
                model=self.text_model,
                messages=messages,
                response_format={"type": "json_schema", "json_schema": schema},
                timeout=timeout,
            )
        )
        return r.choices[0].message.content or ""

    def generate_image(self, prompt: str, user: str, timeout: float) -> bytes:
        r = self._call(
            lambda: self._sdk.images.generate(
                model=self.image_model,
                prompt=prompt,
                n=1,
                size="1024x1024",
                response_format="b64_json",
                user=user,
                timeout=timeout,
            )
        )
        b64 = r.data[0].b64_json if r.data else None
        if not b64:
            raise ModelError("empty image response")
        return base64.b64decode(b64)

    def sam(self, image_bytes: bytes, phrase: str, timeout: float) -> str:
        data_url = f"data:{_sniff_mime(image_bytes)};base64," + base64.b64encode(image_bytes).decode()
        body = {
            "model": self.sam_model,
            "input": [
                {
                    "type": "message",
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": phrase},
                        {"type": "input_image", "image_url": data_url},
                    ],
                }
            ],
            "stream": True,
            "metadata": {"include_confidence": "true"},  # c=... в боксах (бриф §4)
        }

        def run() -> str:
            out: list[str] = []
            done_text = ""
            completed = False
            with httpx.stream(
                "POST",
                f"{self._base_url}/responses",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json=body,
                timeout=timeout,
            ) as resp:
                if resp.status_code >= 400:
                    resp.read()
                    raise _HttpStatus(resp)
                for line in resp.iter_lines():
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if not payload or payload == "[DONE]":
                        continue
                    try:
                        ev = json.loads(payload)
                    except ValueError:
                        continue
                    kind = ev.get("type")
                    if kind == "response.output_text.delta":
                        out.append(ev.get("delta", ""))
                    elif kind == "response.output_text.done":
                        done_text = ev.get("text") or ""
                    elif kind == "response.completed":
                        completed = True
                    elif kind in ("response.failed", "error"):
                        raise ModelError("sam stream failed")
            if not completed:  # оборванный поток нельзя читать как «ничего не найдено»
                raise ModelError("sam stream incomplete")
            return "".join(out) or done_text

        return self._call(run)


def client_from_settings() -> MetaClient:
    from app.config import get_settings

    s = get_settings()
    return MetaClient(s.MODEL_API_KEY, s.META_BASE_URL, s.MODEL_TEXT, s.MODEL_IMAGE, s.MODEL_SAM)
