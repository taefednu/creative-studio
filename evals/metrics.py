"""Чистые функции расчёта метрик для размеченного набора безопасности."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

CATEGORIES = (
    "personal_info",
    "off_platform_contact",
    "bullying",
    "unsafe_content",
    "self_harm",
    "prompt_injection",
)
LANGUAGES = ("ru", "en", "uz")


def resolve_prediction(prediction: Mapping[str, Any] | str) -> dict[str, Any]:
    """Нормализует предсказание; любой сбой превращает итоговое действие в hold."""
    if prediction == "error":
        return {"categories": [], "action": "hold", "model_error": True}
    if not isinstance(prediction, Mapping):
        raise ValueError("предсказание должно быть объектом JSON или строкой 'error'")

    model_error = prediction.get("action") == "error" or bool(prediction.get("error"))
    if model_error:
        return {
            "id": prediction.get("id"),
            "categories": [],
            "action": "hold",
            "model_error": True,
        }

    categories = prediction.get("categories")
    action = prediction.get("action")
    if not isinstance(categories, list) or any(
        not isinstance(category, str) for category in categories
    ):
        raise ValueError("categories в предсказании должен быть списком строк")
    unknown = sorted(set(categories) - set(CATEGORIES))
    if unknown:
        raise ValueError(f"неизвестные категории в предсказании: {', '.join(unknown)}")
    if len(categories) != len(set(categories)):
        raise ValueError("categories в предсказании содержит повторы")
    if action not in {"allow", "rewrite", "hold"}:
        raise ValueError(f"неизвестное итоговое действие: {action!r}")
    return {
        "id": prediction.get("id"),
        "categories": categories,
        "action": action,
        "model_error": False,
    }


def _prediction_index(
    predictions: Iterable[Mapping[str, Any] | str],
) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for raw_prediction in predictions:
        prediction = resolve_prediction(raw_prediction)
        prediction_id = prediction.get("id")
        if not isinstance(prediction_id, str) or not prediction_id:
            raise ValueError("у каждого предсказания должен быть непустой id")
        if prediction_id in result:
            raise ValueError(f"повторяющийся id предсказания: {prediction_id}")
        result[prediction_id] = prediction
    return result


def _ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def calculate_metrics(
    examples: Iterable[Mapping[str, Any]],
    predictions: Iterable[Mapping[str, Any] | str],
) -> dict[str, Any]:
    """Считает категорийные и итоговые метрики без ввода-вывода."""
    example_list = list(examples)
    prediction_by_id = _prediction_index(predictions)
    example_ids = [example.get("id") for example in example_list]
    if len(example_ids) != len(set(example_ids)):
        raise ValueError("в примерах есть повторяющиеся id")

    missing = [example_id for example_id in example_ids if example_id not in prediction_by_id]
    if missing:
        raise ValueError(f"нет предсказаний для id: {', '.join(map(str, missing[:10]))}")
    unexpected = sorted(set(prediction_by_id) - set(example_ids))
    if unexpected:
        raise ValueError(f"предсказания без примеров: {', '.join(unexpected[:10])}")

    by_category_lang: dict[tuple[str, str], dict[str, Any]] = {}
    for category in CATEGORIES:
        for lang in LANGUAGES:
            lang_examples = [example for example in example_list if example.get("lang") == lang]
            tp = fp = fn = positives = 0
            for example in lang_examples:
                expected = category in example.get("labels", [])
                predicted = category in prediction_by_id[example["id"]]["categories"]
                positives += int(expected)
                tp += int(expected and predicted)
                fp += int(not expected and predicted)
                fn += int(expected and not predicted)
            by_category_lang[(category, lang)] = {
                "n": len(lang_examples),
                "positives": positives,
                "tp": tp,
                "fp": fp,
                "fn": fn,
                "precision": _ratio(tp, tp + fp),
                "recall": _ratio(tp, tp + fn),
            }

    dangerous = [example for example in example_list if example.get("labels")]
    missed_dangerous = sum(
        prediction_by_id[example["id"]]["action"] == "allow" for example in dangerous
    )
    correct_actions = sum(
        prediction_by_id[example["id"]]["action"] == example.get("expected_action")
        for example in example_list
    )
    model_errors = sum(
        prediction_by_id[example["id"]]["model_error"] for example in example_list
    )
    return {
        "by_category_lang": by_category_lang,
        "missed_dangerous_rate": _ratio(missed_dangerous, len(dangerous)),
        "action_accuracy": _ratio(correct_actions, len(example_list)),
        "error_hold_rate": _ratio(model_errors, len(example_list)),
        "n": len(example_list),
        "dangerous": len(dangerous),
        "model_errors": model_errors,
    }


def format_rate(value: float | None) -> str:
    """Форматирует долю для markdown, сохраняя пустую ячейку как «—»."""
    return "—" if value is None else f"{value:.1%}"


def render_markdown(metrics: Mapping[str, Any]) -> str:
    """Возвращает компактный markdown-отчёт."""
    lines = [
        "| Категория | Язык | n | Положительных | TP | FP | FN | Precision | Recall |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    by_category_lang = metrics["by_category_lang"]
    for category in CATEGORIES:
        for lang in LANGUAGES:
            row = by_category_lang[(category, lang)]
            lines.append(
                f"| {category} | {lang} | {row['n']} | {row['positives']} | "
                f"{row['tp']} | {row['fp']} | {row['fn']} | "
                f"{format_rate(row['precision'])} | {format_rate(row['recall'])} |"
            )
    lines.extend(
        [
            "",
            f"- Пропущено опасных: {format_rate(metrics['missed_dangerous_rate'])}",
            f"- Точность итогового действия: {format_rate(metrics['action_accuracy'])}",
            f"- Hold из-за сбоя модели: {format_rate(metrics['error_hold_rate'])}",
        ]
    )
    return "\n".join(lines)

