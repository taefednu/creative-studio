"""Проверка структуры, покрытия и разбиения синтетических eval-наборов."""

from __future__ import annotations

import json
import sys
from collections import Counter
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

CATEGORIES = (
    "personal_info",
    "off_platform_contact",
    "bullying",
    "unsafe_content",
    "self_harm",
    "prompt_injection",
)
TYPES = ("prompt", "post", "comment")
LANGUAGES = ("ru", "en", "uz")
SPLITS = ("dev", "test")
EXPECTED_FIELDS = {
    "id",
    "type",
    "lang",
    "text",
    "labels",
    "expected_action",
    "split",
}
MIN_EXAMPLES = 30
MIN_CATEGORY_POSITIVES = 5
MIN_SAFE_SHARE = 0.4


def expected_action(record_type: str, labels: list[str]) -> str:
    """Возвращает решение кода по таблице §5 спеки."""
    if not labels:
        return "allow"
    label_set = set(labels)
    if label_set == {"unsafe_content"} and record_type == "prompt":
        return "rewrite"
    if label_set == {"bullying"} and record_type == "comment":
        return "rewrite"
    return "hold"


def _validate_record(record: Any, index: int) -> list[str]:
    prefix = f"запись {index}"
    if not isinstance(record, Mapping):
        return [f"{prefix}: ожидается JSON-объект"]
    errors: list[str] = []
    fields = set(record)
    if fields != EXPECTED_FIELDS:
        missing = sorted(EXPECTED_FIELDS - fields)
        extra = sorted(fields - EXPECTED_FIELDS)
        if missing:
            errors.append(f"{prefix}: отсутствуют поля: {', '.join(missing)}")
        if extra:
            errors.append(f"{prefix}: лишние поля: {', '.join(extra)}")
    if not isinstance(record.get("id"), str) or not record.get("id"):
        errors.append(f"{prefix}: id должен быть непустой строкой")
    record_type = record.get("type")
    if record_type not in TYPES:
        errors.append(f"{prefix}: неизвестный type: {record_type!r}")
    if record.get("lang") not in LANGUAGES:
        errors.append(f"{prefix}: неизвестный lang: {record.get('lang')!r}")
    if not isinstance(record.get("text"), str) or not record.get("text", "").strip():
        errors.append(f"{prefix}: text должен быть непустой строкой")
    labels = record.get("labels")
    if not isinstance(labels, list) or any(not isinstance(label, str) for label in labels):
        errors.append(f"{prefix}: labels должен быть списком строк")
    else:
        unknown = sorted(set(labels) - set(CATEGORIES))
        if unknown:
            errors.append(f"{prefix}: неизвестные labels: {', '.join(unknown)}")
        if len(labels) != len(set(labels)):
            errors.append(f"{prefix}: labels содержит повторы")
        if record_type in TYPES and not unknown:
            wanted_action = expected_action(record_type, labels)
            if record.get("expected_action") != wanted_action:
                errors.append(
                    f"{prefix}: expected_action должен быть {wanted_action!r}, "
                    f"получен {record.get('expected_action')!r}"
                )
    if record.get("expected_action") not in {"allow", "rewrite", "hold"}:
        errors.append(
            f"{prefix}: неизвестный expected_action: {record.get('expected_action')!r}"
        )
    if record.get("split") not in SPLITS:
        errors.append(f"{prefix}: неизвестный split: {record.get('split')!r}")
    return errors


def validate_records(records: Iterable[Mapping[str, Any]]) -> list[str]:
    """Возвращает все ошибки набора; пустой список означает валидный набор."""
    record_list = list(records)
    errors: list[str] = []
    ids: set[str] = set()
    valid_records: list[Mapping[str, Any]] = []
    for index, record in enumerate(record_list, start=1):
        record_errors = _validate_record(record, index)
        errors.extend(record_errors)
        record_id = record.get("id") if isinstance(record, Mapping) else None
        if isinstance(record_id, str):
            if record_id in ids:
                errors.append(f"повторяющийся id: {record_id}")
            ids.add(record_id)
        if not record_errors:
            valid_records.append(record)

    for record_type in TYPES:
        for lang in LANGUAGES:
            cell = [
                record
                for record in valid_records
                if record["type"] == record_type and record["lang"] == lang
            ]
            if len(cell) < MIN_EXAMPLES:
                errors.append(
                    f"{record_type} × {lang}: всего {len(cell)}, "
                    f"нужно не менее {MIN_EXAMPLES}"
                )
            safe_count = sum(not record["labels"] for record in cell)
            safe_share = safe_count / len(cell) if cell else 0.0
            if safe_share < MIN_SAFE_SHARE:
                errors.append(
                    f"{record_type} × {lang}: безопасных {safe_count}/{len(cell)} "
                    f"({safe_share:.1%}), нужно не менее {MIN_SAFE_SHARE:.0%}"
                )
            for category in CATEGORIES:
                positives = sum(category in record["labels"] for record in cell)
                if positives < MIN_CATEGORY_POSITIVES:
                    errors.append(
                        f"{record_type} × {lang} × {category}: положительных "
                        f"{positives}, нужно не менее {MIN_CATEGORY_POSITIVES}"
                    )

            overall_split = Counter(record["split"] for record in cell)
            if abs(overall_split["dev"] - overall_split["test"]) > 1:
                errors.append(
                    f"{record_type} × {lang}: split несбалансирован "
                    f"({overall_split['dev']} dev / {overall_split['test']} test)"
                )
            for stratum in ("safe", *CATEGORIES):
                stratum_records = [
                    record
                    for record in cell
                    if (not record["labels"] if stratum == "safe" else stratum in record["labels"])
                ]
                split_counts = Counter(record["split"] for record in stratum_records)
                if stratum_records and abs(split_counts["dev"] - split_counts["test"]) > 1:
                    errors.append(
                        f"{record_type} × {lang} × {stratum}: split несбалансирован "
                        f"({split_counts['dev']} dev / {split_counts['test']} test)"
                    )
    return errors


def load_sets(set_dir: Path) -> tuple[list[dict[str, Any]], list[str]]:
    records: list[dict[str, Any]] = []
    errors: list[str] = []
    for filename, wanted_type in (
        ("prompts.jsonl", "prompt"),
        ("posts.jsonl", "post"),
        ("comments.jsonl", "comment"),
    ):
        path = set_dir / filename
        if not path.is_file():
            errors.append(f"нет файла: {path}")
            continue
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                errors.append(f"{path}:{line_number}: пустая строка")
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as error:
                errors.append(f"{path}:{line_number}: невалидный JSON: {error.msg}")
                continue
            if isinstance(record, dict) and record.get("type") != wanted_type:
                errors.append(
                    f"{path}:{line_number}: type должен быть {wanted_type!r}, "
                    f"получен {record.get('type')!r}"
                )
            records.append(record)
    return records, errors


def render_counts(records: Iterable[Mapping[str, Any]]) -> str:
    counts: Counter[tuple[str, str, str, str]] = Counter()
    for record in records:
        if not isinstance(record, Mapping):
            continue
        record_type = record.get("type")
        lang = record.get("lang")
        split = record.get("split")
        labels = record.get("labels")
        if (
            record_type not in TYPES
            or lang not in LANGUAGES
            or split not in SPLITS
            or not isinstance(labels, list)
            or any(label not in CATEGORIES for label in labels)
        ):
            continue
        strata = labels or ["safe"]
        for category in strata:
            counts[(record_type, lang, category, split)] += 1
    lines = [
        "| Тип | Язык | Категория | n | dev | test |",
        "|---|---:|---|---:|---:|---:|",
    ]
    for record_type in TYPES:
        for lang in LANGUAGES:
            for category in ("safe", *CATEGORIES):
                dev = counts[(record_type, lang, category, "dev")]
                test = counts[(record_type, lang, category, "test")]
                lines.append(
                    f"| {record_type} | {lang} | {category} | {dev + test} | {dev} | {test} |"
                )
    return "\n".join(lines)


def main() -> int:
    set_dir = Path(__file__).with_name("sets")
    records, load_errors = load_sets(set_dir)
    errors = [*load_errors, *validate_records(records)]
    print(render_counts(records))
    if errors:
        print("\nОшибки набора:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print(f"\nOK: {len(records)} записей, все минимумы и split соблюдены.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
