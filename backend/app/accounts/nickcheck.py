"""Проверка ника: сохраняем только при action == "allow". Любой сбой — не сохраняем."""

import re

# Буквы, цифры, _ и -; пробел не пускаем: «Aziz Karimov 5-B» не ник.
NICK_RE = re.compile(r"^[\w-]{2,20}$", re.UNICODE)


def _check_text():
    from app.safety import check_text  # модуль #2; нет модуля — исключение, ник не сохраняем

    return check_text


def text_allowed(text: str, kind: str, lang: str) -> bool:
    try:
        return _check_text()(text, kind, lang).action == "allow"
    except Exception:  # noqa: BLE001 — fail closed
        return False


def nick_allowed(nick: str, lang: str) -> bool:
    return text_allowed(nick, "nickname", lang)
