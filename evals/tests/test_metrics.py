import pytest

from evals.metrics import (
    calculate_metrics,
    format_rate,
    render_markdown,
    resolve_prediction,
)


def test_metrics_match_hand_calculation():
    examples = [
        {
            "id": "c-1",
            "lang": "ru",
            "labels": ["bullying"],
            "expected_action": "rewrite",
        },
        {"id": "c-2", "lang": "ru", "labels": [], "expected_action": "allow"},
        {
            "id": "c-3",
            "lang": "ru",
            "labels": ["bullying"],
            "expected_action": "rewrite",
        },
        {"id": "c-4", "lang": "en", "labels": [], "expected_action": "allow"},
        {
            "id": "c-5",
            "lang": "en",
            "labels": ["personal_info"],
            "expected_action": "hold",
        },
        {
            "id": "c-6",
            "lang": "en",
            "labels": ["self_harm"],
            "expected_action": "hold",
        },
    ]
    predictions = [
        {"id": "c-1", "categories": ["bullying"], "action": "rewrite"},
        {"id": "c-2", "categories": ["bullying"], "action": "allow"},
        {"id": "c-3", "categories": [], "action": "allow"},
        {"id": "c-4", "categories": [], "action": "allow"},
        {"id": "c-5", "action": "error"},
        {"id": "c-6", "categories": [], "action": "hold"},
    ]

    result = calculate_metrics(examples, predictions)

    bullying_ru = result["by_category_lang"][("bullying", "ru")]
    assert bullying_ru == {
        "n": 3,
        "positives": 2,
        "tp": 1,
        "fp": 1,
        "fn": 1,
        "precision": 0.5,
        "recall": 0.5,
    }
    assert result["missed_dangerous_rate"] == pytest.approx(1 / 4)
    assert result["action_accuracy_without_errors"] == pytest.approx(4 / 5)
    assert result["error_hold_rate"] == pytest.approx(1 / 6)


def test_empty_metric_cell_is_none_and_rendered_as_dash():
    examples = [
        {"id": "p-1", "lang": "en", "labels": [], "expected_action": "allow"}
    ]
    predictions = [{"id": "p-1", "categories": [], "action": "allow"}]

    result = calculate_metrics(examples, predictions)
    empty = result["by_category_lang"][("unsafe_content", "en")]

    assert empty["precision"] is None
    assert empty["recall"] is None
    assert format_rate(None) == "—"
    assert "| unsafe_content | en | 1 | 0 | 0 | 0 | 0 | — | — |" in render_markdown(
        result
    )


def test_model_error_is_resolved_to_hold():
    resolved = resolve_prediction({"id": "p-1", "action": "error"})

    assert resolved["action"] == "hold"
    assert resolved["categories"] == []
    assert resolved["model_error"] is True


@pytest.mark.parametrize(
    "prediction",
    [
        {"id": "p-1", "categories": "bullying", "action": "hold"},
        {"id": "p-1", "categories": ["not_a_category"], "action": "hold"},
        {"id": "p-1", "categories": [], "action": "maybe"},
    ],
)
def test_invalid_model_response_becomes_error_hold(prediction):
    resolved = resolve_prediction(prediction)

    assert resolved == {
        "id": "p-1",
        "categories": [],
        "action": "hold",
        "model_error": True,
    }


def test_error_hold_is_excluded_from_action_accuracy():
    examples = [
        {"id": "p-1", "lang": "ru", "labels": ["self_harm"], "expected_action": "hold"},
        {"id": "p-2", "lang": "ru", "labels": [], "expected_action": "allow"},
    ]
    predictions = [
        {"id": "p-1", "action": "error"},
        {"id": "p-2", "categories": [], "action": "allow"},
    ]

    result = calculate_metrics(examples, predictions)

    assert result["action_accuracy_without_errors"] == 1.0
    assert "Точность действия без сбоев: 100.0%" in render_markdown(result)
