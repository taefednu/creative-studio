"""Один раз генерирует картинки конструктора «Помоги придумать» (frontend/public/art/prompt).

Запуск из backend/: uv run python scripts/gen_prompt_art.py [имя ...]
Каждая проходит check_image до сохранения; уже лежащие не перегенерируются (~$0.01 за вызов).
"""

import io
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.meta.client import client_from_settings
from app.safety import check_image
from app.works.image.templates import BY_ID, build_prompt

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "art" / "prompt"
SIZE = 256

ART = {
    "who-cat": "a cute orange kitten",
    "who-dragon": "a cute little green dragon",
    "who-robot": "a cute small friendly robot",
    "who-puppy": "a cute puppy",
    "who-bunny": "a cute white bunny",
    "who-penguin": "a cute baby penguin",
    "who-dino": "a cute little dinosaur",
    "who-fox": "a cute fox cub",
    "where-moon": "a big crescent moon with stars",
    "where-castle": "a small fairy tale castle",
    "where-forest": "a cozy green forest with round trees",
    "where-sea": "colorful coral under the sea with bubbles",
    "where-clouds": "fluffy clouds with a rainbow",
    "where-space": "a ringed planet and stars in space",
    "where-candy": "a tiny house made of candy and sweets",
    "where-samarkand": "a palace with blue domes like Samarkand",
    "what-watermelon": "a slice of watermelon",
    "what-fly": "a pair of small white wings",
    "what-dance": "a pair of dancing shoes with music notes",
    "what-paint": "a paint palette and a brush",
    "what-bake": "a birthday cake with candles",
    "what-sing": "a microphone with music notes",
    "what-ball": "a colorful bouncy ball",
    "what-swim": "a swim ring on blue water",
}


def main(only: list[str]) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    client = None
    failed = 0
    for name, subject in ART.items():
        path = OUT / f"{name}.webp"
        if (only and name not in only) or path.exists():
            continue
        try:
            client = client or client_from_settings()
            raw = client.generate_image(
                build_prompt(BY_ID["clay"], f"{subject}, centered, single object, plain soft pastel background, no text, no people"),
                "demo",
                90,
            )
            d = check_image(raw, "image_result", "en")
        except Exception as e:  # noqa: BLE001
            print(f"{name}: ERROR {type(e).__name__}")
            failed += 1
            continue
        if d.action != "allow":
            print(f"{name}: not saved, check_image={d.action}")
            failed += 1
            continue
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        im.thumbnail((SIZE, SIZE))
        im.save(path, "WEBP", quality=85)
        print(f"{name}: saved")
    return failed


if __name__ == "__main__":
    sys.exit(1 if main(sys.argv[1:]) else 0)
