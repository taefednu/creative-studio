"""Наполняет ПУСТУЮ базу (DATABASE_URL) выдуманными данными для демо-стенда и снимков.

Запуск из backend/: DATABASE_URL=... UPLOAD_DIR=... uv run python scripts/seed_demo.py [--images DIR] [--out FILE]
Без вызова моделей Meta. Картинки берёт из scripts/demo_images (gen_demo_images.py). Отказывается,
если в базе уже есть родители, учителя или дети, и если картинок нет. Печатает JSON с логинами и id.
"""

import argparse
import json
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image
from sqlalchemy import func, select, update

from app import clock
from app import db as dbmod
from app.accounts import coins
from app.accounts.models import Child, ClassMembership, Classroom, CoinLedger, Parent, Teacher
from app.accounts.security import hash_secret, picture_secret
from app.assignments.models import Assignment, Submission
from app.config import get_settings
from app.feed.models import Comment, Post, Reaction
from app.moderation import hold
from app.works.image.models import Work
from app.works.image.pipeline import upload_path
from app.works.image.templates import TEMPLATES
from app.works.upload.pipeline import save_original, to_webp
from app.works.upload.sam import blur

ADULT_PW = "demo-pass-1234"
PICTURES = [3, 7, 1]
KINDS = ("star", "heart", "laugh", "wow")
MATES = ["Lumi", "SkyFox", "PixelPanda", "MoonCat", "DinoDash", "LimeLion", "OllieTree", "SunnyBee", "TikTak", "Zuzu"]
CAPTIONS = {0: "Лиса идёт домой", 2: "Мой первый робот", 5: "Тут живёт мой друг", 7: "Динозавр охраняет коврик",
            9: "A rocket for my brother", 12: "Котёнок и его венок", 15: "Дракончик не страшный"}
LANGS = ["ru", "en", "uz"]


def load_images(d: Path) -> list[dict]:
    """Картинки каталога по порядку манифеста; без манифеста — по имени, шаблоны по кругу."""
    mf = d / "manifest.json"
    meta = {m["slug"]: m for m in json.loads(mf.read_text(encoding="utf-8"))} if mf.is_file() else {}
    slugs = [s for s in meta if (d / f"{s}.webp").is_file()] or sorted(p.stem for p in d.glob("*.webp"))
    return [
        {"path": d / f"{s}.webp", "slug": s, "template_id": meta.get(s, {}).get("template_id")
         or TEMPLATES[i % len(TEMPLATES)].id}
        for i, s in enumerate(slugs)
    ]


def seed(images_dir: Path) -> dict:
    imgs = load_images(images_dir)
    if not imgs:
        raise SystemExit(f"нет картинок в {images_dir}: запусти scripts/gen_demo_images.py")
    dbmod.init_db()
    s = dbmod.new_session()
    if any(s.scalar(select(func.count()).select_from(m)) for m in (Parent, Teacher, Child)):
        raise SystemExit("база не пуста (есть родители, учителя или дети): демо льётся только в пустую")
    now = clock.now()
    n_img = len(imgs)
    rid = iter(range(1, 10_000))

    def ago(**kw):
        return now - timedelta(**kw)

    teacher = Teacher(email="aziza@example.com", pw_hash=hash_secret(ADULT_PW))
    parent = Parent(email="parent@example.com", pw_hash=hash_secret(ADULT_PW))
    s.add_all([teacher, parent])
    s.flush()
    room = Classroom(teacher_id=teacher.id, name="4B Stars", code="STARS4")
    s.add(room)
    s.flush()
    ph = hash_secret(picture_secret(PICTURES))

    def child(nick, age, lang, parent_id=None, in_class=True):
        c = Child(nick=nick, nick_norm=nick.lower(), age_group=age, lang=lang, parent_id=parent_id,
                  picture_password_hash=ph)
        s.add(c)
        s.flush()
        coins.add_entry(s, c.id, get_settings().COIN_START, "start", f"start:{c.id}")
        if in_class:
            s.add(ClassMembership(child_id=c.id, class_id=room.id))
        return c

    fox = child("StarFox", "9-12", "ru", parent.id)
    bunny = child("Bunny", "5-8", "en", parent.id, in_class=False)
    mates = [child(n, "9-12" if i % 3 else "5-8", LANGS[i % 3]) for i, n in enumerate(MATES)]
    kids = [fox, *mates]

    def work(c, i, when, status="ready", **kw):
        im = imgs[i % n_img]
        w = Work(child_id=c.id, template_id=im["template_id"], status=status, request_id=f"demo-{next(rid)}",
                 created_at=when - timedelta(minutes=5), **kw)
        s.add(w)
        s.flush()
        if status == "ready" and kw.get("kind", "image") == "image":
            p = upload_path(w.id)
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(im["path"].read_bytes())
            w.file_path = str(p)
            ref = f"gen:{w.id}:1"
            if coins.charge(s, c.id, get_settings().IMAGE_PRICE, "generation", ref) == "ok":
                s.execute(update(CoinLedger).where(CoinLedger.ref_id == ref).values(created_at=when - timedelta(minutes=4)))
        return w

    def daily(c, days_ago):
        d = ago(days=days_ago)
        ref = f"daily:{c.id}:{d.date().isoformat()}"
        coins.add_entry(s, c.id, get_settings().COIN_DAILY, "daily", ref)
        s.execute(update(CoinLedger).where(CoinLedger.ref_id == ref).values(created_at=d))

    # ---- 20 постов класса ----
    posts: list[Post] = []
    for i in range(20):
        author = kids[i % len(kids)]
        extra = {"remix_of_post_id": posts[3].id} if i == 9 else {}
        when = ago(hours=i * 8 + 1)
        w = work(author, i, when, **extra)
        p = Post(work_id=w.id, child_id=author.id, audience="class", class_id=room.id, caption=CAPTIONS.get(i),
                 status="published", best=i in (2, 5), remix_allowed=i != 8, created_at=when)
        s.add(p)
        s.flush()
        posts.append(p)
    for i, p in enumerate(posts):
        pool = [k for k in kids if k.id != p.child_id]
        for k in range(1 + (i * 5) % 9):
            s.add(Reaction(post_id=p.id, child_id=pool[(i + k) % len(pool)].id, kind=KINDS[(i + k) % 4]))
    whale = posts[6]
    for who, text, h in ((mates[1], "Какой добрый кит!", 2), (mates[3], "Очень красиво, люблю облака", 3),
                         (mates[7], "Хочу такого кита", 5)):
        s.add(Comment(post_id=whale.id, child_id=who.id, text=text, status="published",
                      created_at=whale.created_at + timedelta(hours=h)))

    # ---- работы StarFox и Bunny на разных днях ----
    for i, d in enumerate((1, 2, 4, 6)):
        work(fox, 20 + i, ago(days=d, hours=3))
    daily(fox, 5)
    daily(fox, 2)
    daily(mates[0], 3)
    daily(mates[4], 1)
    fam = []
    for i, d in enumerate((1, 3)):
        when = ago(days=d, hours=2)
        w = work(bunny, 4 + i, when)
        p = Post(work_id=w.id, child_id=bunny.id, audience="family", caption=("Мой щенок" if i == 0 else None),
                 status="published", created_at=when)
        s.add(p)
        s.flush()
        fam.append(p)
    work(bunny, 8, ago(days=5, hours=4))
    daily(bunny, 4)
    # незавершённые у StarFox: refused (возврат монеты) и held
    wr = work(fox, 11, ago(hours=6), status="generating", child_text="Нарисуй дракона на облаке")
    wr.status, wr.reason_codes = "refused", ["content_policy"]
    ref = f"gen:{wr.id}:1"
    coins.charge(s, fox.id, get_settings().IMAGE_PRICE, "generation", ref)
    coins.add_entry(s, fox.id, get_settings().IMAGE_PRICE, "refund", f"refund:{wr.id}:1")
    hold(s, item_type="prompt", target_id=wr.id, child_id=fox.id, reviewer="parent",
         reason_codes=["content_policy"], preview_text=wr.child_text, commit=False)
    wh = work(fox, 12, ago(hours=3), status="held", child_text="Нарисуй мой двор и нашу собаку Рекса")
    wh.reason_codes = ["personal_info"]
    hold(s, item_type="prompt", target_id=wh.id, child_id=fox.id, reviewer="parent",
         reason_codes=["personal_info"], preview_text=wh.child_text, commit=False)

    # ---- «Ждёт вашего OK» у родителя: личные промпты Bunny ----
    # ponytail: у prompt нет картинки-превью (IMAGE_TYPES ручки проверки её не отдаёт), поэтому только текст.
    bunny_items = []
    for i, text in enumerate(("Нарисуй меня у моего дома на Липовой улице", "Draw my school, I go to school No. 5")):
        w = work(bunny, 14 + i, ago(hours=10 + i * 20), status="held", child_text=text)
        w.reason_codes = ["personal_info"]
        h = hold(s, item_type="prompt", target_id=w.id, child_id=bunny.id, reviewer="parent",
                 reason_codes=["personal_info"], preview_text=text, commit=False)
        h.created_at = w.created_at
        bunny_items.append(h)

    # ---- «Задержано» у учителя: 5 записей ----
    by = {m.nick: m for m in mates}
    lumi_c = Comment(post_id=posts[4].id, child_id=by["Lumi"].id, status="held", created_at=ago(hours=1),
                     text="Мне сегодня очень грустно, иногда хочется, чтобы меня не было")
    s.add(lumi_c)
    s.flush()
    teacher_items = [hold(s, item_type="comment", target_id=lumi_c.id, child_id=by["Lumi"].id, reviewer="both",
                          reason_codes=["self_harm"], urgent=True, class_id=room.id, preview_text=lumi_c.text,
                          commit=False)]
    sky = work(by["SkyFox"], 3, ago(hours=4), status="held", child_text="Давай в другом приложении, там я покажу")
    sky.reason_codes = ["off_platform_contact"]
    teacher_items.append(hold(s, item_type="prompt", target_id=sky.id, child_id=sky.child_id, reviewer="parent",
                              reason_codes=["off_platform_contact"], preview_text=sky.child_text, commit=False))
    # загрузка PixelPanda: оригинал только в orig/, дети видят размытую file_path
    up = Work(child_id=by["PixelPanda"].id, kind="upload", template_id="upload", status="ready",
              request_id=f"demo-{next(rid)}", reason_codes=["blurred_face"], created_at=ago(hours=5))
    s.add(up)
    s.flush()
    im = Image.open(imgs[0]["path"]).convert("RGB")
    save_original(up.id, im)
    w_, h_ = im.size
    box = (w_ // 3, h_ // 4, w_ * 2 // 3, h_ // 2)  # ponytail: бокс-заглушка, синтетика без людей; SAM не зовём
    p = upload_path(up.id)
    p.write_bytes(to_webp(blur(im, [box], get_settings().BLUR_PAD)))
    up.file_path = str(p)
    teacher_items.append(hold(s, item_type="upload", target_id=up.id, child_id=up.child_id, reviewer="parent",
                              reason_codes=["blurred_face"], commit=False))
    mw = work(by["MoonCat"], 9, ago(hours=7))
    mp = Post(work_id=mw.id, child_id=mw.child_id, audience="class", class_id=room.id, status="held",
              caption="Этот рисунок такой глупый, смешно на него смотреть", created_at=ago(hours=7))
    s.add(mp)
    s.flush()
    teacher_items.append(hold(s, item_type="post", target_id=mp.id, child_id=mp.child_id, reviewer="teacher",
                              reason_codes=["bullying"], class_id=room.id, preview_text=mp.caption, commit=False))
    dino = work(by["DinoDash"], 13, ago(hours=9), status="held",
                child_text="Нарисуй мой дом, мы живём на Цветочной 5, квартира 12")
    dino.reason_codes = ["personal_info"]
    teacher_items.append(hold(s, item_type="prompt", target_id=dino.id, child_id=dino.child_id, reviewer="parent",
                              reason_codes=["personal_info"], preview_text=dino.child_text, commit=False))
    for h in teacher_items[1:]:
        h.created_at = ago(hours=4 + 2 * teacher_items.index(h))

    # ---- задания ----
    a1 = Assignment(class_id=room.id, teacher_id=teacher.id, title="Нарисуй героя сегодняшней сказки",
                    description="Придумай героя из сказки, которую мы читали на уроке, и нарисуй его.",
                    due_at=now + timedelta(days=2), created_at=ago(days=1))
    a2 = Assignment(class_id=room.id, teacher_id=teacher.id, title="Любимое время года",
                    description="Нарисуй, как ты видишь своё любимое время года.", created_at=ago(hours=12))
    s.add_all([a1, a2])
    s.flush()
    subs = []
    for post_i, shown in ((3, True), (4, False), (7, False)):
        pw_ = s.get(Work, posts[post_i].work_id)
        subs.append(Submission(assignment_id=a1.id, work_id=pw_.id, child_id=pw_.child_id, status="accepted",
                               comment="Мой герой — смелый ёж" if shown else None, shown_in_feed=shown,
                               created_at=ago(hours=20 - post_i)))
    s.add_all(subs)
    s.commit()

    return {
        "adult_password": ADULT_PW,
        "child_pictures": PICTURES,
        "teacher": {"email": teacher.email, "id": teacher.id},
        "parent": {"email": parent.email, "id": parent.id},
        "class": {"id": room.id, "name": room.name, "code": room.code},
        "children": {c.nick: c.id for c in [*kids, bunny]},
        "posts": [p.id for p in posts],
        "family_posts": [p.id for p in fam],
        "whale_post": whale.id,
        "teacher_held_items": [h.id for h in teacher_items],
        "urgent_item": teacher_items[0].id,
        "upload_item": teacher_items[2].id,
        "parent_held_items": [h.id for h in bunny_items],
        "assignments": [a1.id, a2.id],
        "refused_work": wr.id,
        "held_work": wh.id,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", default=str(Path(__file__).resolve().parent / "demo_images"))
    ap.add_argument("--out")
    a = ap.parse_args()
    out = json.dumps(seed(Path(a.images)), ensure_ascii=False, indent=1)
    if a.out:
        Path(a.out).write_text(out, encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
