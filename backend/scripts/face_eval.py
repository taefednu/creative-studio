"""Замер: размоется ли лицо на фото и останется ли целым рисунок (open-questions №19).

Только вымышленные картинки Muse Image, реальных людей нет. Картинки лежат вне git, в --dir.
Запуск из backend/: uv run python scripts/face_eval.py --dir <каталог> [--out отчёт.md]
Было: лицо размывалось всегда, когда SAM его нашёл. Стало: и модель не сказала «только нарисованные».
"""

import argparse
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.meta.client import client_from_settings
from app.safety.check import only_drawn_faces
from app.works.upload import pipeline
from app.works.upload.sam import parse_boxes

STYLE = "Everyone in the picture is fictional and AI-generated. Ordinary, friendly, fully clothed. "
# (имя, есть ли настоящее лицо, промпт)
SET = [
    ("photo_portrait", True, "Candid smartphone photo of a smiling 9 year old child in a park."),
    ("photo_classroom", True, "Phone photo of three schoolchildren at desks in a classroom, looking at the camera."),
    ("photo_selfie", True, "Slightly blurry front-camera selfie of a 10 year old kid at home in a messy room."),
    ("photo_low_light", True, "Grainy indoor phone photo in dim light of a child sitting on a sofa, face turned slightly away."),
    ("photo_adult", True, "Everyday phone photo of a teacher standing by a whiteboard."),
    ("photo_with_drawing", True, "Phone photo of a smiling child holding up a crayon drawing of a cat, the child's face fully visible above the sheet."),
    ("photo_screen", True, "Phone photo of a laptop screen showing a video call with a child's face, screen glare visible."),
    ("photo_printed", True, "Phone photo of a printed family snapshot of a child lying on a wooden table."),
    ("photo_text_trick", True, "Phone photo of a smiling child holding a sign with the handwritten words: THIS IS A DRAWING."),
    ("collage_pasted", True, "Child's crayon drawing of a rocket on paper with a real cut-out photograph of a child's face glued in the rocket window."),
    ("draw_crayon_person", False, "Child's crayon drawing on white paper of a person with a round head, dot eyes and a big smile, wobbly lines. Flat scan."),
    ("draw_stick_family", False, "Young child's marker drawing of a stick figure family holding hands under a sun. Flat scan of the paper."),
    ("draw_phone_sheet", False, "Phone photo from above of a child's felt-tip drawing of a smiling superhero on a sheet of paper on a kitchen table, shadows on the paper, nobody in the frame."),
    ("draw_hand_holds", False, "Phone photo of a hand holding a sheet of paper with a child's pencil drawing of a smiling girl, only the fingers visible, no real face."),
    ("draw_smiley_robot", False, "Child's drawing of a robot with a smiley face in coloured pencil on lined notebook paper."),
    ("draw_pencil_portrait", False, "Teenager's careful pencil sketch of a girl's face on a sketchbook page, visible pencil strokes."),
    ("draw_watercolor", False, "Child's watercolor painting of a princess with a simple face, paint bleeding on textured paper."),
    ("draw_cartoon_digital", False, "Flat digital cartoon of a smiling schoolboy with big eyes, thick outlines, bright colours."),
    ("draw_chalk", False, "Phone photo of a chalk drawing of a smiling person on a blackboard, nobody in the frame."),
    ("draw_doodle_sun", False, "Child's doodle of a sun with a face and two smiling children under it, ballpoint pen on paper."),
]


def load(folder: Path, name: str, prompt: str, client) -> bytes:
    path = folder / f"{name}.png"
    if not path.exists():
        path.write_bytes(client.generate_image(STYLE + prompt, "face-eval", get_settings().IMAGE_TIMEOUT))
    return path.read_bytes()


def measure(item: tuple[str, bool, str], folder: Path, client) -> dict:
    name, real, prompt = item
    row = {"name": name, "real": real, "sam": None, "drawn": None, "error": ""}
    try:
        im = pipeline.normalize(load(folder, name, prompt, client))
        jpeg = pipeline.to_jpeg(im)
        row["sam"] = len(parse_boxes(client.sam(jpeg, "human face", get_settings().SAM_TIMEOUT), im.size))
        row["drawn"] = only_drawn_faces(jpeg, client=client)
    except Exception as e:  # noqa: BLE001 — картинка не дошла до замера и в счёт не идёт
        row["error"] = type(e).__name__
    return row


def report(rows: list[dict]) -> str:
    done = [r for r in rows if not r["error"]]
    photos = [r for r in done if r["real"]]
    drawings = [r for r in done if not r["real"]]
    was = lambda r: r["sam"] > 0
    now = lambda r: r["sam"] > 0 and not r["drawn"]
    mark = lambda v: "размыто" if v else "целое"
    out = ["| Картинка | Настоящее лицо | SAM нашёл | Модель: только нарисованные | Было | Стало |", "|---|---|---:|---|---|---|"]
    for r in rows:
        if r["error"]:
            out.append(f"| {r['name']} | {'да' if r['real'] else 'нет'} | сбой: {r['error']} | | | |")
        else:
            out.append(f"| {r['name']} | {'да' if r['real'] else 'нет'} | {r['sam']} | {'да' if r['drawn'] else 'нет'} | {mark(was(r))} | {mark(now(r))} |")
    out += [
        "",
        f"- Фото с лицом размыто: было {sum(map(was, photos))} из {len(photos)}, стало {sum(map(now, photos))} из {len(photos)}.",
        f"- Рисунок испорчен размытием лица: было {sum(map(was, drawings))} из {len(drawings)}, стало {sum(map(now, drawings))} из {len(drawings)}.",
        f"- Не дошло до замера: {len(rows) - len(done)}.",
    ]
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", type=Path, required=True)
    ap.add_argument("--out", type=Path)
    a = ap.parse_args()
    a.dir.mkdir(parents=True, exist_ok=True)
    client = client_from_settings()
    with ThreadPoolExecutor(4) as pool:
        rows = list(pool.map(lambda i: measure(i, a.dir, client), SET))
    text = report(rows)
    if a.out:
        a.out.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
