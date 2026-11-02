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
    # расширение ленты 02.11: лента не должна кончаться за пару экранов
    ("more_superhero_0", "superhero", "Котик-пожарный спасает воздушный шар", "a kitten firefighter rescuing a balloon from a tree"),
    ("more_superhero_1", "superhero", "Хомяк-супергерой на велосипеде", "a hamster superhero riding a tiny bicycle"),
    ("more_superhero_2", "superhero", "Пингвин в красном плаще", "a penguin superhero with a red cape over an icy city"),
    ("more_superhero_3", "superhero", "Утёнок останавливает дождь", "a duckling hero holding a giant umbrella over a town"),
    ("more_superhero_4", "superhero", "Лисёнок летит на ракетном рюкзаке", "a fox cub flying with a rocket backpack"),
    ("more_superhero_5", "superhero", "Ёжик-защитник леса", "a brave hedgehog guarding a forest with a glowing shield"),
    ("more_superhero_6", "superhero", "Слонёнок с суперсилой", "a baby elephant superhero lifting a toy bus"),
    ("more_superhero_7", "superhero", "Сова-детектив ночью", "an owl detective with a magnifying glass over a night city"),
    ("more_space_pet_0", "space_pet", "Хомяк на Сатурне", "a hamster astronaut sliding on the rings of Saturn"),
    ("more_space_pet_1", "space_pet", "Черепаха-космонавт", "a turtle astronaut floating near the moon"),
    ("more_space_pet_2", "space_pet", "Щенок на Марсе", "a puppy astronaut planting a flower on Mars"),
    ("more_space_pet_3", "space_pet", "Пингвин на ледяной планете", "a penguin astronaut on an ice planet"),
    ("more_space_pet_4", "space_pet", "Кролик и морковная ракета", "a bunny astronaut in a carrot shaped rocket"),
    ("more_space_pet_5", "space_pet", "Ленивец на Луне", "a sloth astronaut napping on a crescent moon"),
    ("more_space_pet_6", "space_pet", "Панда строит базу на Луне", "a panda astronaut building a small moon base"),
    ("more_space_pet_7", "space_pet", "Лисёнок считает звёзды", "a fox cub astronaut counting stars with a telescope"),
    ("more_clay_0", "clay", "Пластилиновый аквариум", "a plasticine aquarium with funny fish"),
    ("more_clay_1", "clay", "Улитка с домиком-тортом", "a clay snail with a cake for a shell"),
    ("more_clay_2", "clay", "Паровозик в горах", "a clay toy train going through mountains"),
    ("more_clay_3", "clay", "Пластилиновая ферма", "a tiny plasticine farm with cows and sheep"),
    ("more_clay_4", "clay", "Осьминог-повар", "a clay octopus chef cooking soup"),
    ("more_clay_5", "clay", "Город грибов", "a little clay town of mushroom houses"),
    ("more_clay_6", "clay", "Жираф в шарфе", "a clay giraffe wearing a very long scarf"),
    ("more_clay_7", "clay", "Лягушки играют в оркестре", "clay frogs playing in a small orchestra"),
    ("more_anime_0", "anime", "Девятихвостая лисичка у озера", "a nine tailed fox cub by a shining lake"),
    ("more_anime_1", "anime", "Котёнок-волшебник", "a kitten wizard casting sparkling stars"),
    ("more_anime_2", "anime", "Летающий кит над городом", "a huge friendly whale flying above a small town"),
    ("more_anime_3", "anime", "Светлячки в бамбуковом лесу", "fireflies in a bamboo forest with a tiny red panda"),
    ("more_anime_4", "anime", "Хаски на поезде", "a husky puppy looking out of a train window at mountains"),
    ("more_anime_5", "anime", "Дракончик и чайная церемония", "a little dragon having tea with a rabbit"),
    ("more_anime_6", "anime", "Сова-почтальон", "an owl mail carrier flying over rooftops at sunset"),
    ("more_anime_7", "anime", "Сад на крыше", "a cat in a rooftop garden at golden hour"),
    ("more_pixel_0", "pixel", "Пиксельная ферма", "a pixel art farm with chickens and a red barn"),
    ("more_pixel_1", "pixel", "Подводный замок", "a pixel art underwater castle with fish"),
    ("more_pixel_2", "pixel", "Пиксельный дракон", "a small friendly pixel art dragon on a hill"),
    ("more_pixel_3", "pixel", "Космическая станция", "a pixel art space station with little robots"),
    ("more_pixel_4", "pixel", "Вулкан и динозавры", "a pixel art valley with friendly dinosaurs and a far volcano"),
    ("more_pixel_5", "pixel", "Магазин мороженого", "a pixel art ice cream shop on a sunny street"),
    ("more_pixel_6", "pixel", "Рыцарь-котик", "a pixel art cat knight in front of a castle"),
    ("more_pixel_7", "pixel", "Зимняя деревня", "a pixel art snowy village at night"),
    ("more_watercolor_0", "watercolor", "Лебеди на озере", "two swans on a calm lake at sunrise"),
    ("more_watercolor_1", "watercolor", "Бабочки над лавандой", "butterflies over a lavender field"),
    ("more_watercolor_2", "watercolor", "Маленький маяк", "a small lighthouse by the sea"),
    ("more_watercolor_3", "watercolor", "Ёжик под грибом", "a hedgehog sheltering under a mushroom in the rain"),
    ("more_watercolor_4", "watercolor", "Олень в зимнем лесу", "a young deer in a snowy forest"),
    ("more_watercolor_5", "watercolor", "Морские коньки", "seahorses among soft sea plants"),
    ("more_watercolor_6", "watercolor", "Воздушные шары над долиной", "hot air balloons over a green valley"),
    ("more_watercolor_7", "watercolor", "Лисичка и осенние листья", "a fox cub playing in autumn leaves"),
    ("more_paper_0", "paper", "Бумажный океан", "a paper cut-out ocean with a sailing ship and a whale"),
    ("more_paper_1", "paper", "Бумажные джунгли", "paper cut-out jungle with a tiger cub and parrots"),
    ("more_paper_2", "paper", "Город на холмах", "a paper cut-out town on green hills"),
    ("more_paper_3", "paper", "Подводный сад", "paper cut-out coral garden with colorful fish"),
    ("more_paper_4", "paper", "Цирковой шатёр", "a paper cut-out circus tent with balloons, animals only"),
    ("more_paper_5", "paper", "Ночной лес", "paper cut-out night forest with owls and a big moon"),
    ("more_paper_6", "paper", "Сказочный поезд", "a paper cut-out train crossing a bridge in the clouds"),
    ("more_paper_7", "paper", "Пустыня и верблюды", "paper cut-out desert with camels and an old city, Samarkand style domes"),
    ("more_castle_0", "castle", "Замок из ракушек", "a fairy tale castle made of sea shells on a beach"),
    ("more_castle_1", "castle", "Ледяной дворец", "a shining ice palace under the northern lights"),
    ("more_castle_2", "castle", "Самаркандские купола", "a magical palace with blue domes like Samarkand at sunset"),
    ("more_castle_3", "castle", "Замок на спине дракона", "a small castle on the back of a sleeping friendly dragon"),
    ("more_castle_4", "castle", "Лесной замок", "a castle grown out of giant old trees"),
    ("more_castle_5", "castle", "Замок в бутылке", "a tiny fairy tale castle inside a glass bottle"),
    ("more_castle_6", "castle", "Радужный мост", "a rainbow bridge leading to a castle in the sky"),
    ("more_castle_7", "castle", "Замок из книг", "a castle built from huge colorful books"),
    ("extra_0_superhero", "superhero", "Лягушка в короне", "a tiny frog wearing a golden crown"),
    ("extra_0_clay", "clay", "Лягушка в короне", "a tiny frog wearing a golden crown"),
    ("extra_0_watercolor", "watercolor", "Лягушка в короне", "a tiny frog wearing a golden crown"),
    ("extra_0_castle", "castle", "Лягушка в короне", "a tiny frog wearing a golden crown"),
    ("extra_1_anime", "anime", "Кот-пекарь и булочки", "a cat baker with fresh buns"),
    ("extra_1_watercolor", "watercolor", "Кот-пекарь и булочки", "a cat baker with fresh buns"),
    ("extra_1_superhero", "superhero", "Кот-пекарь и булочки", "a cat baker with fresh buns"),
    ("extra_1_clay", "clay", "Кот-пекарь и булочки", "a cat baker with fresh buns"),
    ("extra_2_paper", "paper", "Собака на скейтборде", "a puppy riding a skateboard"),
    ("extra_2_superhero", "superhero", "Собака на скейтборде", "a puppy riding a skateboard"),
    ("extra_2_anime", "anime", "Собака на скейтборде", "a puppy riding a skateboard"),
    ("extra_2_watercolor", "watercolor", "Собака на скейтборде", "a puppy riding a skateboard"),
    ("extra_3_space_pet", "space_pet", "Енот-художник", "a raccoon painter at an easel"),
    ("extra_3_anime", "anime", "Енот-художник", "a raccoon painter at an easel"),
    ("extra_3_paper", "paper", "Енот-художник", "a raccoon painter at an easel"),
    ("extra_3_superhero", "superhero", "Енот-художник", "a raccoon painter at an easel"),
    ("extra_4_pixel", "pixel", "Белка на воздушном шаре", "a squirrel in a hot air balloon"),
    ("extra_4_paper", "paper", "Белка на воздушном шаре", "a squirrel in a hot air balloon"),
    ("extra_4_space_pet", "space_pet", "Белка на воздушном шаре", "a squirrel in a hot air balloon"),
    ("extra_4_anime", "anime", "Белка на воздушном шаре", "a squirrel in a hot air balloon"),
    ("extra_5_castle", "castle", "Медвежонок и мёд", "a bear cub with a honey pot in a meadow"),
    ("extra_5_space_pet", "space_pet", "Медвежонок и мёд", "a bear cub with a honey pot in a meadow"),
    ("extra_5_pixel", "pixel", "Медвежонок и мёд", "a bear cub with a honey pot in a meadow"),
    ("extra_5_paper", "paper", "Медвежонок и мёд", "a bear cub with a honey pot in a meadow"),
    ("extra_6_clay", "clay", "Дельфины в радуге", "dolphins jumping through a rainbow"),
    ("extra_6_pixel", "pixel", "Дельфины в радуге", "dolphins jumping through a rainbow"),
    ("extra_6_castle", "castle", "Дельфины в радуге", "dolphins jumping through a rainbow"),
    ("extra_6_space_pet", "space_pet", "Дельфины в радуге", "dolphins jumping through a rainbow"),
    ("extra_7_watercolor", "watercolor", "Попугай-пират", "a parrot pirate on a treasure island"),
    ("extra_7_castle", "castle", "Попугай-пират", "a parrot pirate on a treasure island"),
    ("extra_7_clay", "clay", "Попугай-пират", "a parrot pirate on a treasure island"),
    ("extra_7_pixel", "pixel", "Попугай-пират", "a parrot pirate on a treasure island"),
    ("extra_8_superhero", "superhero", "Единорог в саду", "a baby unicorn in a flower garden"),
    ("extra_8_clay", "clay", "Единорог в саду", "a baby unicorn in a flower garden"),
    ("extra_8_watercolor", "watercolor", "Единорог в саду", "a baby unicorn in a flower garden"),
    ("extra_8_castle", "castle", "Единорог в саду", "a baby unicorn in a flower garden"),
    ("extra_9_anime", "anime", "Робот поливает цветы", "a small robot watering flowers"),
    ("extra_9_watercolor", "watercolor", "Робот поливает цветы", "a small robot watering flowers"),
    ("extra_9_superhero", "superhero", "Робот поливает цветы", "a small robot watering flowers"),
    ("extra_9_clay", "clay", "Робот поливает цветы", "a small robot watering flowers"),
    ("extra_10_paper", "paper", "Краб строит замок", "a crab building a sand castle"),
    ("extra_10_superhero", "superhero", "Краб строит замок", "a crab building a sand castle"),
    ("extra_10_anime", "anime", "Краб строит замок", "a crab building a sand castle"),
    ("extra_10_watercolor", "watercolor", "Краб строит замок", "a crab building a sand castle"),
    ("extra_11_space_pet", "space_pet", "Мышка в библиотеке", "a mouse reading a huge book in a library"),
    ("extra_11_anime", "anime", "Мышка в библиотеке", "a mouse reading a huge book in a library"),
    ("extra_11_paper", "paper", "Мышка в библиотеке", "a mouse reading a huge book in a library"),
    ("extra_11_superhero", "superhero", "Мышка в библиотеке", "a mouse reading a huge book in a library"),
    ("extra_12_pixel", "pixel", "Пчёлы и цветочный город", "bees flying around a town of flowers"),
    ("extra_12_paper", "paper", "Пчёлы и цветочный город", "bees flying around a town of flowers"),
    ("extra_12_space_pet", "space_pet", "Пчёлы и цветочный город", "bees flying around a town of flowers"),
    ("extra_12_anime", "anime", "Пчёлы и цветочный город", "bees flying around a town of flowers"),
    ("extra_13_castle", "castle", "Лама в горах", "a fluffy llama on a mountain path"),
    ("extra_13_space_pet", "space_pet", "Лама в горах", "a fluffy llama on a mountain path"),
    ("extra_13_pixel", "pixel", "Лама в горах", "a fluffy llama on a mountain path"),
    ("extra_13_paper", "paper", "Лама в горах", "a fluffy llama on a mountain path"),
    ("extra_14_clay", "clay", "Страна сладостей", "a land of cookies and ice cream hills"),
    ("extra_14_pixel", "pixel", "Страна сладостей", "a land of cookies and ice cream hills"),
    ("extra_14_castle", "castle", "Страна сладостей", "a land of cookies and ice cream hills"),
    ("extra_14_space_pet", "space_pet", "Страна сладостей", "a land of cookies and ice cream hills"),
    ("extra_15_watercolor", "watercolor", "Поезд в космосе", "a steam train flying among the stars"),
    ("extra_15_castle", "castle", "Поезд в космосе", "a steam train flying among the stars"),
    ("extra_15_clay", "clay", "Поезд в космосе", "a steam train flying among the stars"),
    ("extra_15_pixel", "pixel", "Поезд в космосе", "a steam train flying among the stars"),
    ("extra_16_superhero", "superhero", "Домик в тыкве", "a cozy house inside a giant pumpkin"),
    ("extra_16_clay", "clay", "Домик в тыкве", "a cozy house inside a giant pumpkin"),
    ("extra_16_watercolor", "watercolor", "Домик в тыкве", "a cozy house inside a giant pumpkin"),
    ("extra_16_castle", "castle", "Домик в тыкве", "a cozy house inside a giant pumpkin"),
    ("extra_17_anime", "anime", "Корабль в небе", "a wooden flying ship above the clouds"),
    ("extra_17_watercolor", "watercolor", "Корабль в небе", "a wooden flying ship above the clouds"),
    ("extra_17_superhero", "superhero", "Корабль в небе", "a wooden flying ship above the clouds"),
    ("extra_17_clay", "clay", "Корабль в небе", "a wooden flying ship above the clouds"),
    ("extra_18_paper", "paper", "Снеговик и друзья-звери", "a snowman with forest animals"),
    ("extra_18_superhero", "superhero", "Снеговик и друзья-звери", "a snowman with forest animals"),
    ("extra_18_anime", "anime", "Снеговик и друзья-звери", "a snowman with forest animals"),
    ("extra_18_watercolor", "watercolor", "Снеговик и друзья-звери", "a snowman with forest animals"),
    ("extra_19_space_pet", "space_pet", "Подводный город", "a glowing underwater city with fish"),
    ("extra_19_anime", "anime", "Подводный город", "a glowing underwater city with fish"),
    ("extra_19_paper", "paper", "Подводный город", "a glowing underwater city with fish"),
    ("extra_19_superhero", "superhero", "Подводный город", "a glowing underwater city with fish"),
    ("extra_20_pixel", "pixel", "Динозавр на пикнике", "a friendly dinosaur at a picnic"),
    ("extra_20_paper", "paper", "Динозавр на пикнике", "a friendly dinosaur at a picnic"),
    ("extra_20_space_pet", "space_pet", "Динозавр на пикнике", "a friendly dinosaur at a picnic"),
    ("extra_20_anime", "anime", "Динозавр на пикнике", "a friendly dinosaur at a picnic"),
    ("extra_21_castle", "castle", "Хлопковое поле и аист", "a stork over a white cotton field at sunrise"),
    ("extra_21_space_pet", "space_pet", "Хлопковое поле и аист", "a stork over a white cotton field at sunrise"),
    ("extra_21_pixel", "pixel", "Хлопковое поле и аист", "a stork over a white cotton field at sunrise"),
    ("extra_21_paper", "paper", "Хлопковое поле и аист", "a stork over a white cotton field at sunrise"),
    ("extra_22_clay", "clay", "Дыня-планета", "a giant melon planet with tiny animals"),
    ("extra_22_pixel", "pixel", "Дыня-планета", "a giant melon planet with tiny animals"),
    ("extra_22_castle", "castle", "Дыня-планета", "a giant melon planet with tiny animals"),
    ("extra_22_space_pet", "space_pet", "Дыня-планета", "a giant melon planet with tiny animals"),
    ("extra_23_watercolor", "watercolor", "Чайный домик у реки", "a little tea house by a river with blue tiles"),
    ("extra_23_castle", "castle", "Чайный домик у реки", "a little tea house by a river with blue tiles"),
    ("extra_23_clay", "clay", "Чайный домик у реки", "a little tea house by a river with blue tiles"),
    ("extra_23_pixel", "pixel", "Чайный домик у реки", "a little tea house by a river with blue tiles"),
    ("extra_24_superhero", "superhero", "Огромный гранат-дом", "a tiny house inside a giant pomegranate"),
    ("extra_24_clay", "clay", "Огромный гранат-дом", "a tiny house inside a giant pomegranate"),
    ("extra_24_watercolor", "watercolor", "Огромный гранат-дом", "a tiny house inside a giant pomegranate"),
    ("extra_24_castle", "castle", "Огромный гранат-дом", "a tiny house inside a giant pomegranate"),
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
