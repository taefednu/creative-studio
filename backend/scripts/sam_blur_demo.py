"""Живая проба #15: Muse Image рисует вымышленную сцену, дальше настоящий конвейер загрузки.

Запуск из backend/: uv run python scripts/sam_blur_demo.py [--style cartoon|realistic] [--image f.png]
Без реальных людей: картинку генерирует модель, герой вымышленный. Пишет до/после в
/tmp/ui-15/{before,after}.webp и печатает, что нашла каждая сущность.
"""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.meta.client import client_from_settings
from app.works.upload import pipeline
from app.works.upload.sam import ENTITIES, blur, parse_boxes

PROMPTS = {
    "cartoon": (
        "Flat cartoon illustration of a fictional smiling schoolboy in a navy blue school uniform "
        "(blazer and tie) standing in front of a house. On the wall is a large white metal plate "
        "with the big house number 42, clearly legible. The boy holds up a large sheet of paper "
        "with the name Aziz written on it in big handwritten letters. Bright clear colors."
    ),
    "realistic": (
        "Realistic photographic illustration of a fictional, AI-generated schoolboy in a school "
        "uniform standing at the gate of a house. A clearly readable house number 42 on a wall "
        "plate. He holds a notebook page with a handwritten first name in large letters."
    ),
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--style", choices=list(PROMPTS), default="cartoon")
    ap.add_argument("--image", help="готовая картинка вместо генерации (вымышленная!)")
    a = ap.parse_args()
    out = Path("/tmp/ui-15")
    out.mkdir(parents=True, exist_ok=True)
    s = get_settings()

    if a.image:
        raw = Path(a.image).read_bytes()
    else:
        t = time.monotonic()
        raw = client_from_settings().generate_image(PROMPTS[a.style], "demo-15", s.IMAGE_TIMEOUT)
        print(f"generate_image {time.monotonic() - t:.1f}s {len(raw)} bytes")
    im = pipeline.normalize(raw)
    (out / "before.webp").write_bytes(pipeline.to_webp(im))
    jpeg = pipeline.to_jpeg(im)
    print(f"image {im.size}")

    t = time.monotonic()
    d = pipeline.check_image(jpeg, "upload", "ru")
    print(f"check_image {time.monotonic() - t:.1f}s action={d.action} categories={d.categories}")

    all_boxes = []
    for phrase, code in ENTITIES:
        t = time.monotonic()
        try:
            text = pipeline.sam_call(jpeg, phrase, s.SAM_TIMEOUT)
            boxes = parse_boxes(text, im.size)
            note = ""
        except Exception as e:  # noqa: BLE001
            boxes, note = [], f" ERROR {type(e).__name__} {getattr(e, 'status', '')}"
        print(f"sam {phrase!r}: {len(boxes)} boxes {boxes} {time.monotonic() - t:.1f}s{note}")
        all_boxes += boxes

    after = blur(im, all_boxes, s.BLUR_PAD) if all_boxes else im
    (out / "after.webp").write_bytes(pipeline.to_webp(after))
    print(f"blurred regions: {len(all_boxes)}; saved {out}/before.webp, {out}/after.webp")
    return 0


if __name__ == "__main__":
    sys.exit(main())
