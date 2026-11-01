"""Команда отмечает пост как «Лучшее»: python scripts/mark_best.py <post_id> [--off]. Ручки в API нет."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("SESSION_SECRET", "mark-best")

from app.db import init_db, new_session
from app.feed import models


def main() -> int:
    if len(sys.argv) < 2 or not sys.argv[1].isdigit():
        print("usage: mark_best.py <post_id> [--off]")
        return 2
    init_db()
    with new_session() as db:
        p = db.get(models.Post, int(sys.argv[1]))
        if p is None or p.status != "published":
            print("post not found or not published")
            return 1
        p.best = "--off" not in sys.argv
        db.commit()
        print(f"post {p.id} best={p.best}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
