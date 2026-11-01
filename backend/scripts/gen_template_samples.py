"""Один раз генерирует картинки-примеры шаблонов в frontend/public/templates/<id>.webp.

Запуск из backend/: uv run python scripts/gen_template_samples.py [id ...]
Каждая картинка проходит check_image до сохранения; не allow — не сохраняем. Ключ из .env.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.meta.client import client_from_settings
from app.safety import check_image
from app.works.image.pipeline import to_webp
from app.works.image.templates import TEMPLATES, build_prompt

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "templates"


def main(only: list[str]) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    client = client_from_settings()
    failed = 0
    for t in TEMPLATES:
        if only and t.id not in only:
            continue
        try:
            raw = client.generate_image(build_prompt(t, None), "samples", 90)
            d = check_image(raw, "image_result", "en")
        except Exception as e:  # noqa: BLE001
            print(f"{t.id}: ERROR {type(e).__name__}")
            failed += 1
            continue
        if d.action != "allow":
            print(f"{t.id}: not saved, check_image={d.action}")
            failed += 1
            continue
        (OUT / f"{t.id}.webp").write_bytes(to_webp(raw))
        print(f"{t.id}: saved")
    return failed


if __name__ == "__main__":
    sys.exit(1 if main(sys.argv[1:]) else 0)
