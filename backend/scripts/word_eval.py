"""Замер: настоящая надпись остаётся размытой, а закорючку перестали принимать за надпись.

Только вымышленные картинки, вне git. Запуск из backend/:
uv run python scripts/word_eval.py --dir <каталог с картинками прошлого замера> --sheet <лист.jpg> [--also a.webp ...]
Печатает по каждой вырезке, что нашёл SAM и что ответила модель; лист показывает боксы: красный размыт, зелёный снят.
"""

import argparse
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image, ImageDraw

from app.config import get_settings
from app.meta.client import client_from_settings
from app.safety.check import no_readable_text
from app.works.upload import pipeline
from app.works.upload.sam import parse_boxes

SET = {
    "text_name_sheet": "Phone photo of a sheet of notebook paper with the first name Leo handwritten in big messy pencil letters.",
    "text_signed_drawing": "Child's crayon drawing of a house with the name Aziz and class 4B written small in the bottom corner.",
    "text_cyrillic_name": "Child's marker drawing of a cat with the name Азиз written in wobbly Cyrillic letters under it.",
    "text_phone_number": "Child's pencil drawing of a tree with a phone number 00 000 00 00 written beside it.",
    "text_school_book": "Phone photo of a school notebook cover with a handwritten label: Malika, class 3A.",
    "scribble_rocket": "Very simple child's digital doodle with a mouse on white: a thin rocket, wavy purple lines, pink flames, green grass. No text, no letters at all.",
    "scribble_lines": "Child's felt-tip scribble on white paper: loops, zigzags and circles in many colours. No text, no letters at all.",
    "scribble_garden": "Child's crayon drawing of flowers and grass with lots of short strokes on white paper. No text, no letters at all.",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", type=Path, required=True)
    ap.add_argument("--sheet", type=Path, required=True)
    ap.add_argument("--also", type=Path, nargs="*", default=[])
    a = ap.parse_args()
    client, s = client_from_settings(), get_settings()
    for name, prompt in SET.items():
        path = a.dir / f"{name}.png"
        if not path.exists():
            path.write_bytes(client.generate_image(prompt, "word-eval", s.IMAGE_TIMEOUT))
    files = [*sorted(a.dir.glob("*.png")), *a.also]

    def measure(f: Path) -> tuple[Path, Image.Image, list]:
        im = pipeline.normalize(f.read_bytes())
        boxes = parse_boxes(client.sam(pipeline.to_jpeg(im), "word", s.SAM_TIMEOUT), im.size)
        kept = pipeline.real_words(im, boxes)
        return f, im, [(b, b in kept) for b in boxes]

    pipeline.no_readable_text = lambda data: no_readable_text(data, client=client)
    with ThreadPoolExecutor(4) as pool:
        rows = list(pool.map(measure, files))
    tile, cols = 260, 6
    sheet = Image.new("RGB", (tile * cols, (tile + 16) * (len(rows) // cols + 1)), "white")
    for i, (f, im, found) in enumerate(rows):
        print(f"{f.stem:24} найдено {len(found)}, размыто {sum(k for _, k in found)}, снято {sum(not k for _, k in found)}")
        d = ImageDraw.Draw(im)
        for b, kept in found:
            d.rectangle(b, outline="red" if kept else "lime", width=6)
        im.thumbnail((tile, tile))
        x, y = (i % cols) * tile, (i // cols) * (tile + 16)
        sheet.paste(im, (x, y + 16))
        ImageDraw.Draw(sheet).text((x + 3, y + 2), f.stem, fill="black")
    sheet.save(a.sheet, quality=85)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
