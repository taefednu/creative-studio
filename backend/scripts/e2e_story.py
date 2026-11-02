"""Живой прогон «Оживи рисунок» и сказки: настоящий сервер, настоящие модели Meta, рисунок из кода.

Своя временная база и UPLOAD_DIR; реальных детей и их данных нет. Тратит деньги (около $0.15 за прогон).
    cd backend && uv run python scripts/e2e_story.py [--port 8199] [--out /путь/sheet.png]
Печатает смену статусов и секунды; сохраняет контактный лист (рисунок, герой, 4 страницы).
Код выхода 1, если сказка не дошла до ready.
"""

import argparse
import io
import random
import secrets
import sys
import tempfile
import time
from pathlib import Path

import httpx
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from e2e_live import Api, adult, child, start_server

T0 = time.time()


def log(msg: str) -> None:
    print(f"[{time.time() - T0:5.0f} c] {msg}", flush=True)


def child_drawing() -> bytes:
    """Каракуля на бумаге: кривой зелёный зверёк с четырьмя лапами. Нарисован кодом."""
    rnd = random.Random(7)
    im = Image.new("RGB", (900, 900), (244, 240, 226))
    d = ImageDraw.Draw(im)
    j = lambda p: (p[0] + rnd.randint(-4, 4), p[1] + rnd.randint(-4, 4))
    d.ellipse((260, 330, 640, 640), fill=(120, 190, 90), outline=(30, 90, 30), width=7)  # тело
    d.ellipse((330, 170, 570, 390), fill=(120, 190, 90), outline=(30, 90, 30), width=7)  # голова
    for x, y in ((290, 600), (380, 640), (510, 640), (600, 600)):  # кривые лапы
        d.line([j((x, y)), j((x - 10, y + 80)), j((x + 15, y + 150))], fill=(30, 90, 30), width=14)
    d.ellipse((380, 250, 420, 290), fill="white", outline="black", width=4)
    d.ellipse((480, 250, 520, 290), fill="white", outline="black", width=4)
    d.ellipse((395, 262, 410, 277), fill="black")
    d.ellipse((495, 262, 510, 277), fill="black")
    d.arc((400, 300, 500, 360), 10, 170, fill=(160, 30, 30), width=6)
    d.polygon([j((620, 520)), j((760, 470)), j((690, 580))], fill=(240, 150, 60), outline=(30, 90, 30))  # хвост
    out = io.BytesIO()
    im.filter(__import__("PIL.ImageFilter", fromlist=["x"]).GaussianBlur(0.6)).save(out, "PNG")
    return out.getvalue()


def wait(a: Api, path: str, done: set[str], limit: int = 300) -> dict:
    """Ждём конечный статус, печатая каждую смену статуса и число готовых страниц."""
    t0, last = time.time(), None
    while time.time() - t0 < limit:
        v = a.get(path).json()
        key = (v.get("status"), sum(1 for p in v.get("pages", []) if p.get("ok")))
        if key != last:
            log(f"{path}: {key[0]}, страниц готово {key[1]}  (+{time.time() - t0:.0f} c)")
            last = key
        if v.get("status") in done:
            return v
        time.sleep(1.5)
    raise SystemExit(f"таймаут {path}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8199)
    ap.add_argument("--out", default="/tmp/e2e_story_sheet.png")
    args = ap.parse_args()
    base = f"http://127.0.0.1:{args.port}"
    code = 1
    with tempfile.TemporaryDirectory() as d:
        srv = start_server(args.port, d)
        try:
            tag = secrets.token_hex(2)
            parent = adult(base, "parent", f"p{tag}@example.com")
            a, _ = child(base, parent, f"SkyFox{tag}")
            drawing = child_drawing()
            log(f"баланс {a.coins()}")

            r = a.post("/api/works/upload", files={"file": ("a.png", drawing, "image/png")})
            up = wait(a, f"/api/works/{r.json()['id']}", {"ready", "held", "failed", "refused"}, 120)
            if up["status"] != "ready":
                log(f"загрузка не стала ready: {up}")
                return 1
            r = a.post(f"/api/works/{up['id']}/alive", {"request_id": secrets.token_hex(8)})
            log(f"alive: {r.status_code} {r.text}")
            hero = wait(a, f"/api/works/{r.json()['id']}", {"ready", "held", "failed", "refused", "support"}, 150)
            log(f"герой: {hero['status']}, баланс {a.coins()}")
            if hero["status"] != "ready":
                return 1

            idea = "Зверёк ищет потерянную звезду и находит нового друга"
            r = a.post("/api/stories", {"hero_work_id": hero["id"], "idea": idea, "request_id": secrets.token_hex(8)})
            log(f"story: {r.status_code} {r.text}")
            sid = r.json()["id"]
            st = wait(a, f"/api/stories/{sid}", {"ready", "held", "failed", "refused", "support"}, 400)
            log(f"сказка: {st['status']} «{st['title']}», баланс {a.coins()}, всего {time.time() - T0:.0f} c")
            for p in st["pages"]:
                log(f"  стр.{p['n']} ok={p['ok']}: {p['text']}")

            sheet = Image.new("RGB", (6 * 360, 360), "white")
            for i, data in enumerate(
                [drawing, a.get(hero["image_url"]).content]
                + [a.get(p["image_url"]).content for p in st["pages"] if p["image_url"]]
            ):
                sheet.paste(Image.open(io.BytesIO(data)).convert("RGB").resize((360, 360)), (i * 360, 0))
            sheet.save(args.out)
            log(f"контактный лист: {args.out}")
            code = 0 if st["status"] == "ready" and len(st["pages"]) == 4 else 1
        except (httpx.HTTPError, AssertionError, KeyError) as e:
            log(f"сбой прогона: {e!r}")
        finally:
            srv.terminate()
            srv.wait(15)
    return code


if __name__ == "__main__":
    sys.exit(main())
