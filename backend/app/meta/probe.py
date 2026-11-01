"""Живая проба Meta Model API: python -m app.meta.probe (из backend/)."""

import json
import sys
import time

from app.config import get_settings
from app.meta.client import MetaClient, ModelError, client_from_settings

SCHEMA = {
    "name": "probe",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {"verdict": {"type": "string", "enum": ["allow", "review"]}},
        "required": ["verdict"],
        "additionalProperties": False,
    },
}


def _step(name: str, model: str, fn):
    t = time.monotonic()
    try:
        res = fn()
    except ModelError as e:
        print(f"FAIL {name} model={model} {time.monotonic() - t:.1f}s error={e} status={e.status}")
        return None
    print(f"OK   {name} model={model} {time.monotonic() - t:.1f}s {_size(res)}")
    return res


def _size(res) -> str:
    if isinstance(res, bytes):
        return f"{len(res)} bytes"
    if isinstance(res, str):
        return f"{len(res)} chars: {res[:120]!r}"
    return f"{len(res)} items"


def main() -> int:
    s = get_settings()
    c: MetaClient = client_from_settings()
    failed = 0

    models = _step("models", "-", c.list_models)
    if models is None:
        return 1
    for need in (s.MODEL_TEXT, s.MODEL_IMAGE, s.MODEL_SAM):
        print(f"     {'present' if need in models else 'MISSING'} in /models: {need}")

    text = _step(
        "text",
        s.MODEL_TEXT,
        lambda: c.chat_json(
            [{"role": "user", "content": "Reply with verdict allow."}], SCHEMA, timeout=60
        ),
    )
    if text is None:
        failed += 1
    else:
        try:
            json.loads(text)
        except ValueError:
            print("FAIL text: not JSON")
            failed += 1

    img = _step(
        "image",
        s.MODEL_IMAGE,
        lambda: c.generate_image("a simple red balloon, flat cartoon", "probe-user", timeout=120),
    )
    if img is None:
        failed += 1
    else:
        sam = _step("sam", s.MODEL_SAM, lambda: c.sam(img, "balloon", timeout=120))
        if sam is None:
            failed += 1
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
