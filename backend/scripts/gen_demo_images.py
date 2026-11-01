"""Один раз генерирует детские картинки (первые 20 — лента класса, остальные — витрина) для демо-стенда в scripts/demo_images/<slug>.webp.

Запуск из backend/: uv run python scripts/gen_demo_images.py [slug ...]
Каждая картинка проходит check_image до сохранения; не allow — не сохраняем. Уже готовые пропускаются
(цена ~$0.01 за вызов). Манифест manifest.json (идея ru/en, template_id) пишется всегда. Ключ из .env.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.meta.client import client_from_settings
from app.safety import check_image
from app.works.image.pipeline import to_webp
from app.works.image.templates import BY_ID, build_prompt

OUT = Path(__file__).resolve().parent / "demo_images"

# slug, template_id, идея ru, идея en
IDEAS = [
    ("fox_lantern", "anime", "Лиса с фонарём ночью в лесу", "a little fox with a lantern in a night forest"),
    ("clay_mill", "clay", "Домик из пластилина с мельницей", "a plasticine clay house with a windmill"),
    ("robot_comic", "superhero", "Робот-комикс", "a friendly robot in a comic book panel"),
    ("night_castle", "castle", "Ночной замок под луной", "a fairy tale castle at night under a big moon"),
    ("bunny_flowers", "watercolor", "Зайчик в цветах", "a little bunny sitting in a field of flowers"),
    ("tree_house", "paper", "Дом на дереве", "a cozy tree house with a rope ladder"),
    ("whale_clouds", "watercolor", "Кит в облаках", "a friendly blue whale swimming through pink clouds"),
    ("toy_dino", "space_pet", "Динозавр-игрушка", "a cute toy dinosaur on a play mat"),
    ("space_cat_neon", "space_pet", "Кот-космонавт в неоне", "a cat astronaut in neon lights among planets"),
    ("toucan_jungle", "anime", "Тукан в джунглях", "a colorful toucan in the jungle"),
    ("floating_island", "castle", "Летающий остров", "a floating island with trees and a waterfall"),
    ("owl_glass", "paper", "Сова-витраж", "an owl in stained glass style"),
    ("kitten_wreath", "watercolor", "Котёнок с венком", "a kitten wearing a flower wreath"),
    ("jellyfish", "watercolor", "Медуза", "a glowing jellyfish in the deep blue sea"),
    ("fog_castle", "castle", "Замок в тумане", "a castle in the morning fog on a hill"),
    ("little_dragon", "clay", "Дракончик", "a tiny friendly dragon with round wings"),
    ("sakura_house", "paper", "Японский домик в сакуре", "a small japanese house among sakura trees"),
    ("corgi", "anime", "Корги", "a happy corgi dog running on the grass"),
    ("clownfish", "pixel", "Рыба-клоун", "a clownfish in a coral reef"),
    ("rocket", "pixel", "Ракета", "a red rocket flying to the stars"),
    # витрина для гостей: посты «Лучшее»
    ("show_mermaid_cat", "anime", "Кошка-русалка в коралловом замке", "a cute cat mermaid in a coral castle"),
    ("show_pizza_planet", "space_pet", "Щенок на планете из пиццы", "a puppy astronaut on a tiny pizza planet"),
    ("show_candy_city", "clay", "Город из конфет и зефира", "a tiny candy and marshmallow town"),
    ("show_dragon_library", "castle", "Дракон-библиотекарь в волшебной башне", "a kind little dragon reading books in a magic tower"),
    ("show_robot_garden", "superhero", "Робот-садовник спасает цветы", "a brave little robot gardener saving flowers"),
    ("show_snow_fox", "watercolor", "Снежная лисичка под северным сиянием", "a snow fox cub under the northern lights"),
    ("show_paper_boats", "paper", "Бумажные кораблики в городе-реке", "paper boats sailing through a river town"),
    ("show_pixel_forest", "pixel", "Сокровище в пиксельном лесу", "a treasure chest in a pixel forest with friendly slimes"),
    ("show_panda_baker", "clay", "Панда печёт радужный торт", "a panda baker with a rainbow cake"),
    ("show_moon_rabbit", "anime", "Лунный кролик с фонарями", "a moon rabbit with floating paper lanterns"),
    ("show_turtle_island", "watercolor", "Остров на спине черепахи", "a little island village on the back of a giant turtle"),
    ("show_comet_kitten", "space_pet", "Котёнок верхом на комете", "a kitten riding a shooting comet"),
    ("show_tiger_hero", "superhero", "Тигрёнок в плаще над городом", "a tiger cub superhero with a cape over a toy city"),
    ("show_paper_zoo", "paper", "Зоопарк из цветной бумаги", "a colorful paper cut-out zoo with giraffes"),
    ("show_pixel_ships", "pixel", "Пиксельные пираты и добрый кит", "pixel art pirate ship meeting a friendly whale"),
    ("show_cloud_castle", "castle", "Замок на облаках с радугой", "a castle on clouds with a rainbow bridge"),
]


def main(only: list[str]) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = [{"slug": s, "template_id": t, "idea_ru": ru, "idea_en": en} for s, t, ru, en in IDEAS]
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    client = None
    failed = 0
    for slug, t, _ru, en in IDEAS:
        if (only and slug not in only) or (OUT / f"{slug}.webp").exists():
            continue
        try:
            client = client or client_from_settings()
            raw = client.generate_image(
                build_prompt(BY_ID[t], f"{en}, no people"), "demo", 90
            )
            d = check_image(raw, "image_result", "en")
        except Exception as e:  # noqa: BLE001
            print(f"{slug}: ERROR {type(e).__name__}")
            failed += 1
            continue
        if d.action != "allow":
            print(f"{slug}: not saved, check_image={d.action}")
            failed += 1
            continue
        (OUT / f"{slug}.webp").write_bytes(to_webp(raw))
        print(f"{slug}: saved")
    return failed


if __name__ == "__main__":
    sys.exit(1 if main(sys.argv[1:]) else 0)
