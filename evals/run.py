"""Построение markdown-отчёта evals по готовым предсказаниям."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from evals.check_sets import load_sets
from evals.metrics import calculate_metrics, render_markdown


def predict(text: str, type: str, lang: str) -> dict[str, Any]:
    """Единая точка будущего подключения живого классификатора."""
    raise NotImplementedError(
        "Живая модель ещё не подключена. Передайте готовый JSONL через --predictions; "
        "другой агент должен заменить только evals.run.predict()."
    )


def load_predictions(path: Path, wanted_ids: set[str]) -> list[dict[str, Any]]:
    predictions: list[dict[str, Any]] = []
    seen: set[str] = set()
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            raise ValueError(f"{path}:{line_number}: пустая строка")
        try:
            prediction = json.loads(line)
        except json.JSONDecodeError as error:
            raise ValueError(
                f"{path}:{line_number}: невалидный JSON: {error.msg}"
            ) from error
        if not isinstance(prediction, dict):
            raise ValueError(f"{path}:{line_number}: ожидается JSON-объект")
        prediction_id = prediction.get("id")
        if prediction_id in seen:
            raise ValueError(f"{path}:{line_number}: повторяющийся id {prediction_id!r}")
        seen.add(prediction_id)
        if prediction_id in wanted_ids:
            predictions.append(prediction)
    return predictions


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split", choices=("dev", "test"), default="test")
    parser.add_argument("--predictions", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    records, errors = load_sets(Path(__file__).with_name("sets"))
    if errors:
        raise SystemExit("Набор не читается:\n- " + "\n- ".join(errors))
    examples = [record for record in records if record["split"] == args.split]
    if args.predictions:
        predictions = load_predictions(args.predictions, {record["id"] for record in examples})
    else:
        predictions = [
            {"id": record["id"], **predict(record["text"], record["type"], record["lang"])}
            for record in examples
        ]
    print(render_markdown(calculate_metrics(examples, predictions)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

