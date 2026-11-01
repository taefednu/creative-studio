"""Адаптер для evals (#3): predict(text, type, lang) -> {"categories": [...], "action": ...}."""

from app.safety.check import check_text

_KIND = {"prompt": "prompt", "post": "caption", "comment": "comment"}
_ACTION = {
    "allow": "allow",
    "rewrite": "rewrite",
    "kinder": "rewrite",
    "refuse": "hold",
    "hold": "hold",
    "support": "hold",
}


def predict(text: str, type: str, lang: str) -> dict:
    try:
        d = check_text(text, _KIND[type], lang)
        if d.model_error:
            return {"action": "error"}
        return {"categories": list(d.categories), "action": _ACTION[d.action]}
    except Exception:  # noqa: BLE001
        return {"action": "error"}
