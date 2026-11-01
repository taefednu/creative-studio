from evals.check_sets import validate_records


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
