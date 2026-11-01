"""Шаблоны картинок: стиль и тему по умолчанию дописывает код. Названия — i18n на фронте по id."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Template:
    id: str
    style: str  # английский суффикс стиля
    default_theme: str  # тема, если ребёнок ничего не написал


TEMPLATES: tuple[Template, ...] = (
    Template(
        "superhero",
        "bold comic book style, halftone dots, dynamic action pose",
        "a friendly kid superhero with a cape flying over a city",
    ),
    Template(
        "space_pet",
        "cute 3D toy render, soft studio lighting",
        "a happy little pet in a space suit floating among planets",
    ),
    Template(
        "clay",
        "handmade plasticine clay style, soft fingerprints texture",
        "a colorful clay world with round hills, trees and a tiny house",
    ),
    Template(
        "anime",
        "bright anime style, big expressive eyes, vivid colors",
        "a young adventurer fox with a lantern in a magical forest",
    ),
    Template(
        "pixel",
        "retro pixel art video game style",
        "a pixel castle on a hill with a waterfall and a small knight",
    ),
    Template(
        "watercolor",
        "soft watercolor painting, pastel clouds, fairy tale mood",
        "a friendly blue whale swimming through pink clouds",
    ),
    Template(
        "paper",
        "layered paper cut craft style, depth and soft shadows",
        "a paper city with small houses, trees, a sun and mountains",
    ),
    Template(
        "castle",
        "fantasy illustration, magical glowing lights, night sky",
        "a fairy tale castle by a lake under a big moon",
    ),
)
BY_ID = {t.id: t for t in TEMPLATES}


def build_prompt(template: Template, text: str | None) -> str:
    """Шаблон + проверенный текст как данные; сырой ввод сюда не попадает."""
    subject = text.strip() if text and text.strip() else template.default_theme
    return f"A friendly children's illustration, safe for kids, {template.style}. Subject: {subject}"
