"""Хеши паролей и подписанная сессия. Только stdlib; секреты и хеши в ответы и логи не идут."""

import base64
import hashlib
import hmac
import json
import secrets

from app import clock
from app.config import get_settings

COOKIE = "studio_session"
_N, _R, _P = 2**14, 8, 1


def _scrypt(secret: str, salt: bytes) -> bytes:
    return hashlib.scrypt(secret.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)


def hash_secret(secret: str) -> str:
    salt = secrets.token_bytes(16)
    return f"scrypt${salt.hex()}${_scrypt(secret, salt).hex()}"


def verify_secret(secret: str, stored: str | None) -> bool:
    """Без записи (None) тратим то же время, чтобы вход не выдавал, есть ли аккаунт."""
    if not stored:
        _scrypt(secret, b"\0" * 16)
        return False
    try:
        _, salt, digest = stored.split("$")
        return hmac.compare_digest(_scrypt(secret, bytes.fromhex(salt)).hex(), digest)
    except ValueError:
        return False


def picture_secret(pictures: list[int]) -> str:
    return ",".join(str(i) for i in pictures)


def _sig(body: bytes) -> str:
    key = get_settings().SESSION_SECRET.encode()
    return hmac.new(key, body, hashlib.sha256).hexdigest()


def make_session(role: str, uid: int) -> str:
    exp = int(clock.now().timestamp()) + get_settings().SESSION_DAYS * 86400
    body = base64.urlsafe_b64encode(json.dumps({"r": role, "i": uid, "e": exp}).encode())
    return f"{body.decode()}.{_sig(body)}"


def read_session(token: str | None) -> tuple[str, int] | None:
    if not token or "." not in token:
        return None
    body_s, sig = token.rsplit(".", 1)
    body = body_s.encode()
    if not hmac.compare_digest(_sig(body), sig):
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(body))
        if data["e"] < int(clock.now().timestamp()):
            return None
        return str(data["r"]), int(data["i"])
    except (ValueError, KeyError, TypeError):
        return None


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()
