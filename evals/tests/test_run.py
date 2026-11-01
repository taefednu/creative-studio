from pathlib import Path

import pytest

from evals import run
from evals.metrics import calculate_metrics


def record(record_id: str, split: str = "dev") -> dict:
    return {
        "id": record_id,
        "type": "prompt",
        "lang": "ru",
        "text": "Нарисуй доброго кота",
        "labels": [],
        "expected_action": "allow",
        "split": split,
    }


def test_predict_exception_becomes_error(monkeypatch):
    def broken_predict(text: str, type: str, lang: str) -> dict:
        raise TimeoutError("model timed out")

    monkeypatch.setattr(run, "predict", broken_predict)

    assert run.predict_records([record("pr-ru-0001")]) == [
        {"id": "pr-ru-0001", "action": "error"}
    ]


def test_predict_garbage_response_becomes_error_hold(monkeypatch):
    def garbage_predict(text: str, type: str, lang: str) -> dict:
        return {"categories": ["mystery"], "action": "maybe"}

    example = record("pr-ru-0001")
    monkeypatch.setattr(run, "predict", garbage_predict)

    metrics = calculate_metrics([example], run.predict_records([example]))

    assert metrics["model_errors"] == 1
    assert metrics["error_hold_rate"] == 1.0
    assert metrics["action_accuracy_without_errors"] is None


def test_few_shot_selector_rejects_test_id():
    records = [record("dev-id"), record("test-id", split="test")]

    with pytest.raises(ValueError, match="test-id.*test"):
        run.get_dev_few_shot(records, ["test-id"])


def test_few_shot_selector_returns_only_requested_dev_records():
    records = [record("dev-a"), record("test-a", split="test"), record("dev-b")]

    selected = run.get_dev_few_shot(records, ["dev-b", "dev-a"])

    assert [item["id"] for item in selected] == ["dev-b", "dev-a"]


def test_out_writes_same_markdown_that_is_printed(tmp_path: Path, capsys):
    output = tmp_path / "report.md"
    exit_code = run.main(["--split", "test", "--fake", "--out", str(output)])

    assert exit_code == 0
    assert output.read_text(encoding="utf-8").strip() == capsys.readouterr().out.strip()
