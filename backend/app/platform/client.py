"""Клиент платформы Mentorium (#5): вход ребёнка/взрослого и монеты через служебный админ-аккаунт.

Платформа — чужой сервис, мы её не меняем. Три правила:
- пароль пользователя уходит на платформу и нигде не остаётся: ни в логах, ни в ошибках, ни в базе;
- токен служебного админа живёт только в памяти процесса, при 401 — один перелогин;
- `adjust` не повторяем сами: у него нет идемпотентности. Таймаут/обрыв = результат неизвестен.
"""

import logging
import threading
import time
import uuid
from dataclasses import dataclass

import httpx

from app.config import get_settings

log = logging.getLogger("app.platform")


class PlatformError(Exception):
    """Базовая. Текст без секретов: только код."""


class NotConfigured(PlatformError):
    pass


class BadCredentials(PlatformError):
    pass


class CaptchaRequired(PlatformError):
    """Капча платформы (после 3 неверных): студия не перебирает, ребёнка отправляем на платформу."""


class Busy(PlatformError):
    """429 платформы: лимит на адрес студии. Это не вина ребёнка и не капча."""


class Unavailable(PlatformError):
    """Платформа не ответила или ответила мусором; запрос заведомо не выполнен."""


class Uncertain(Unavailable):
    """Запрос мог дойти и выполниться (таймаут чтения, обрыв): повторять нельзя."""


@dataclass(frozen=True)
class PlatformUser:
    user_id: str  # id пользователя платформы (UUID), не id ученика
    role: str


def _uuid(value) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, AttributeError, TypeError):
        raise Unavailable("bad_response") from None


class PlatformClient:
    def __init__(self, base_url: str, admin_login: str | None, admin_password: str | None,
                 timeout: float, transport: httpx.BaseTransport | None = None,
                 admin_pause: float = 60.0):
        self._base = base_url.rstrip("/")
        self._login = admin_login
        self._password = admin_password
        self._http = httpx.Client(timeout=timeout, transport=transport)
        self._token: str | None = None  # только память процесса
        self._admin_pause = admin_pause
        self._admin_paused_until = 0.0  # time.monotonic()
        self._lock = threading.Lock()

    # ---- вход пользователя ----

    def login(self, identifier: str, password: str) -> PlatformUser:
        """Логин и пароль -> user_id и роль. Токен пользователя выбрасываем: он нам не нужен."""
        try:
            resp = self._http.post(
                f"{self._base}/api/auth/login", json={"email": identifier, "password": password}
            )
        except httpx.HTTPError:
            raise Unavailable("platform_unreachable") from None
        code = resp.status_code
        if code == 429:
            raise Busy("rate_limited")
        if code == 400:
            detail = _detail(resp)
            if isinstance(detail, dict) and str(detail.get("code", "")).startswith("CAPTCHA"):
                raise CaptchaRequired("captcha")
            raise BadCredentials("bad_request")
        if code in (401, 403, 404, 422):
            raise BadCredentials("bad_credentials")
        if code != 200:
            log.warning("platform login: HTTP %s", code)
            raise Unavailable(f"http_{code}")
        try:
            user = resp.json()["user"]
            return PlatformUser(_uuid(user["id"]), str(user["role"]))
        except (ValueError, KeyError, TypeError):
            raise Unavailable("bad_response") from None

    # ---- служебный админ ----

    def _admin_token(self) -> str:
        with self._lock:
            if self._token:
                return self._token
        if not self._login or not self._password:
            raise NotConfigured("admin_not_configured")
        if time.monotonic() < self._admin_paused_until:
            raise Unavailable("admin_login_paused")  # не долбим платформу отказавшим логином
        try:
            resp = self._http.post(
                f"{self._base}/api/auth/login",
                json={"email": self._login, "password": self._password},
            )
        except httpx.HTTPError:
            raise Unavailable("platform_unreachable") from None
        if resp.status_code != 200:
            # Что бы ни ответили (в т.ч. капча админу): наружу только «недоступна», без тела.
            log.warning("platform admin login: HTTP %s", resp.status_code)
            self._admin_paused_until = time.monotonic() + self._admin_pause
            raise Unavailable("admin_login_failed")
        try:
            token = str(resp.json()["access_token"])
        except (ValueError, KeyError, TypeError):
            raise Unavailable("bad_response") from None
        with self._lock:
            self._token = token
        return token

    def _admin(self, method: str, path: str, *, json=None, retry_401: bool = True) -> httpx.Response:
        """Один перелогин при 401: платформа отвергла токен до обработки, повтор безопасен."""
        try:
            resp = self._http.request(
                method, f"{self._base}{path}", json=json,
                headers={"Authorization": f"Bearer {self._admin_token()}"},
            )
        except (httpx.ConnectError, httpx.ConnectTimeout):
            raise Unavailable("platform_unreachable") from None  # запрос не ушёл
        except httpx.HTTPError:
            raise Uncertain("no_reply") from None  # мог дойти
        if resp.status_code == 401 and retry_401:
            with self._lock:
                self._token = None
            return self._admin(method, path, json=json, retry_401=False)
        return resp

    def balance(self, user_id: str) -> int:
        """Монеты пользователя: GET /api/admin/users/{user_id}/wallet (чтение, повторять можно)."""
        try:
            resp = self._admin("GET", f"/api/admin/users/{_uuid(user_id)}/wallet")
        except Uncertain:
            raise Unavailable("no_reply") from None  # чтение: результат неизвестен не бывает
        if resp.status_code != 200:
            log.warning("platform wallet read: HTTP %s", resp.status_code)
            raise Unavailable(f"http_{resp.status_code}")
        return _coins(resp)

    def adjust(self, user_id: str, coins_delta: int, reason: str) -> int:
        """POST .../users/{user_id}/wallet/adjust. Возвращает новый баланс.

        Unavailable — запрос не выполнен (можно считать, что монет не тронуто);
        Uncertain — результат неизвестен (не повторять). Повторов здесь нет.
        """
        resp = self._admin(
            "POST",
            f"/api/admin/users/{_uuid(user_id)}/wallet/adjust",
            json={"coins_delta": coins_delta, "reason": reason},
        )
        if resp.status_code >= 500:
            # платформа делает commit и только потом отвечает; 502/504 прокси тоже после записи
            log.warning("platform wallet adjust: HTTP %s (result unknown)", resp.status_code)
            raise Uncertain(f"http_{resp.status_code}")
        if resp.status_code != 200:  # 4xx: отвергнуто до записи
            log.warning("platform wallet adjust: HTTP %s", resp.status_code)
            raise Unavailable(f"http_{resp.status_code}")
        try:
            return _coins(resp)
        except Unavailable:
            raise Uncertain("bad_response") from None  # 200, но тело мусорное: применено

    def close(self) -> None:
        self._http.close()


def _detail(resp: httpx.Response):
    try:
        return resp.json().get("detail")
    except (ValueError, AttributeError):
        return None


def _coins(resp: httpx.Response) -> int:
    try:
        v = resp.json()["coins"]
        if isinstance(v, bool) or not isinstance(v, int):
            raise TypeError
        return v
    except (ValueError, KeyError, TypeError):
        raise Unavailable("bad_response") from None


_client: PlatformClient | None = None
_client_key: tuple | None = None


def get_client() -> PlatformClient:
    """Клиент по текущему конфигу. Нет адреса — NotConfigured (роутер отвечает 503)."""
    global _client, _client_key
    if _client is not None and _client_key == ("override",):
        return _client
    s = get_settings()
    if not s.PLATFORM_API_URL:
        raise NotConfigured("platform_not_configured")
    pw = s.PLATFORM_ADMIN_PASSWORD.get_secret_value() if s.PLATFORM_ADMIN_PASSWORD else None
    key = (s.PLATFORM_API_URL, s.PLATFORM_ADMIN_LOGIN, pw, s.PLATFORM_TIMEOUT)
    if _client is None or _client_key != key:
        _client = PlatformClient(
            s.PLATFORM_API_URL, s.PLATFORM_ADMIN_LOGIN, pw, s.PLATFORM_TIMEOUT,
            admin_pause=s.PLATFORM_ADMIN_PAUSE_SECONDS,
        )
        _client_key = key
    return _client


def set_client(client: PlatformClient | None) -> None:
    """Для тестов: подменяет клиент (поддельная платформа на MockTransport)."""
    global _client, _client_key
    _client = client
    _client_key = None
    if client is not None:
        _client_key = ("override",)
