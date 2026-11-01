"""SAM 3.1 для загрузок (#15): разбор ответа в боксы и размытие найденного.

Модель только находит, решает код. Непарсящийся непустой ответ — сбой (fail closed): картинку
нельзя считать «чистой», если мы не смогли прочитать, что нашла модель. Пустой output_text — это
«ничего не найдено», не ошибка (бриф §4).
"""

import re

from meta_sam_parser import CompletedOutcome, image_segmentation_format
from PIL import Image, ImageFilter

# (фраза для SAM, код в причинах). Строки — запросы к модели, не id моделей.
# Фразы подобраны живыми замерами (decisions.md, 01.11): «face» ловит морду нарисованного кота,
# «handwritten name» пропускает имя на листе, а «word» его находит.
ENTITIES = (
    ("human face", "face"),
    ("school uniform", "school_uniform"),
    ("house number", "house_number"),
    ("handwritten name", "handwritten_name"),
    ("word", "written_word"),
)

Box = tuple[int, int, int, int]  # left, top, right, bottom в пикселях картинки, right/bottom не включены
_BOX_TOKEN = re.compile(r"<\|box;([^|]*)\|>")


class SamParseError(Exception):
    pass


def _frame_sizes(text: str) -> set[tuple[int, int]]:
    out: set[tuple[int, int]] = set()
    for body in _BOX_TOKEN.findall(text):
        f = dict(p.split("=", 1) for p in body.split(";") if "=" in p)
        try:
            out.add((int(f["w"]), int(f["h"])))
        except (KeyError, ValueError):
            raise SamParseError("box without w/h") from None
    return out


def parse_boxes(text: str, size: tuple[int, int]) -> list[Box]:
    """Боксы из ответа SAM, пересчитанные в пиксели картинки размера size (W, H)."""
    if not text.strip():
        return []
    try:
        parser = image_segmentation_format().create_parser()
        parser.push(text)
        res = parser.finish(CompletedOutcome()).result
    except Exception as e:  # noqa: BLE001
        raise SamParseError(f"parser: {type(e).__name__}") from None
    if any(d.severity == "error" for d in res.diagnostics):
        raise SamParseError("malformed record")
    recs = [r for r in res.records if r.kind == "box"]
    if not recs:
        raise SamParseError("no boxes in a non-empty answer")
    frames = _frame_sizes(text)
    if len(frames) != 1:
        raise SamParseError("inconsistent frame size")
    (fw, fh), (w, h) = next(iter(frames)), size
    sx, sy = w / fw, h / fh
    out: list[Box] = []
    for r in recs:
        l, t = max(0, int(r.left * sx)), max(0, int(r.top * sy))  # type: ignore[union-attr]
        rt, b = min(w, round(r.right * sx)), min(h, round(r.bottom * sy))  # type: ignore[union-attr]
        if rt <= l or b <= t:
            raise SamParseError("empty box")
        out.append((l, t, rt, b))
    return out


def blur(im: Image.Image, boxes: list[Box], pad: float) -> Image.Image:
    """Гауссово размытие бокса с запасом pad (доля большей стороны). Радиус растёт с боксом."""
    out = im.copy()
    w, h = out.size
    for l, t, r, b in boxes:
        m = int(max(r - l, b - t) * pad)
        l, t, r, b = max(0, l - m), max(0, t - m), min(w, r + m), min(h, b + m)
        radius = max(8, max(r - l, b - t) // 8)
        out.paste(out.crop((l, t, r, b)).filter(ImageFilter.GaussianBlur(radius)), (l, t))
    return out
