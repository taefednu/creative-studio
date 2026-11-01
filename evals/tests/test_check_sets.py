from evals.check_sets import normalize_text, validate_records


def make_record(record_id: str) -> dict:
    return {
        "id": record_id,
        "type": "prompt",
        "lang": "ru",
        "text": "Нарисуй весёлую выдуманную планету",
        "labels": [],
        "expected_action": "allow",
        "split": "dev",
    }


def test_duplicate_id_is_reported():
    errors = validate_records([make_record("p-0001"), make_record("p-0001")])

    assert any("повторяющийся id: p-0001" in error for error in errors)


def test_missing_minimums_are_reported():
    errors = validate_records([make_record("p-0001")])

    assert any("prompt × ru: всего 1, нужно не менее 30" in error for error in errors)
    assert any(
        "prompt × ru × bullying: положительных 0, нужно не менее 5" in error
        for error in errors
    )


def test_normalized_text_duplicate_between_types_is_reported():
    prompt = make_record("pr-ru-0001")
    post = {**make_record("po-ru-0001"), "type": "post"}
    post["text"] = "  НАРИСУЙ, весёлую   выдуманную планету! "

    errors = validate_records([prompt, post])

    assert normalize_text(prompt["text"]) == normalize_text(post["text"])
    assert any("повтор текста между типами" in error for error in errors)


def test_prefix_used_by_only_one_class_is_reported():
    records = []
    for index in range(5):
        item = make_record(f"pr-ru-{index:04d}")
        item["text"] = f"Сделай картинку по идее номер {index}"
        records.append(item)

    errors = validate_records(records)

    assert any("префикс только у safe" in error for error in errors)
