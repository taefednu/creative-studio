"""Построение markdown-отчёта evals по готовым предсказаниям."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from evals.check_sets import load_sets
from evals.metrics import calculate_metrics, render_markdown


def predict(text: str, type: str, lang: str) -> dict[str, Any]:
    """Единая точка будущего подключения живого классификатора."""
    raise NotImplementedError(
        "Живая модель ещё не подключена. Передайте готовый JSONL через --predictions; "
        "другой агент должен заменить только evals.run.predict()."
    )


def get_dev_few_shot(
    records: Iterable[Mapping[str, Any]], wanted_ids: Sequence[str] | None = None
) -> list[Mapping[str, Any]]:
    """Отдаёт только dev-записи и не позволяет случайно раскрыть слепой test."""
    record_list = list(records)
    if wanted_ids is None:
        return [record for record in record_list if record.get("split") == "dev"]
    by_id = {record.get("id"): record for record in record_list}
    selected: list[Mapping[str, Any]] = []
    for record_id in wanted_ids:
        if record_id not in by_id:
            raise ValueError(f"неизвестный few-shot id: {record_id}")
        record = by_id[record_id]
        if record.get("split") != "dev":
            raise ValueError(f"few-shot id {record_id} относится к test")
        selected.append(record)
    return selected


def _fake_predict(text: str, record_type: str, lang: str) -> dict[str, Any]:
    """Простой детерминированный классификатор для CI, без сети и модели."""
    del lang
    normalized = text.casefold()
    patterns = {
        "personal_info": (
            r"\+998|\b998\b|школ[аеы] №|school no\.?|maktab №|улиц[аеы]|street|ko.chasi|"
            r"кв(?:артира)?\.? \d|apartment|xonadon|полное имя|full name|to.liq ism"
        ),
        "off_platform_contact": (
            r"telegram|телег|\bтг\b|\btg\b|insta|инст[ае]|discord|дискорд|@\w+|канал|channel"
        ),
        "bullying": (
            r"дурак|глуп|неудач|никто не хочет|fool|stupid|loser|nobody wants|"
            r"ahmoq|tentak|omadsiz|hech kim"
        ),
        "unsafe_content": (
            r"настоящ(?:ая|ий|ее).*драк|реальн.*насили|real.*fight|real.*violence|"
            r"haqiqiy.*urush|haqiqiy.*zo.ravon"
        ),
        "self_harm": (
            r"не хочу.*жить|лучше бы меня не было|исчезнуть навсегда|don't want to live|"
            r"wish i didn't exist|disappear forever|yashashni xohlamayman|yo.q bo.lib ketsam"
        ),
        "prompt_injection": (
            r"забудь.*правил|игнорируй.*инструк|ты теперь не фильтр|ignore.*instruction|"
            r"forget.*rules|you are not.*filter|qoidalarni unut|ko.rsatmalarni e.tiborsiz"
        ),
    }
    categories = [
        category for category, pattern in patterns.items() if re.search(pattern, normalized)
    ]
    if not categories:
        action = "allow"
    elif categories == ["unsafe_content"] and record_type == "prompt":
        action = "rewrite"
    elif categories == ["bullying"] and record_type == "comment":
        action = "rewrite"
    else:
        action = "hold"
    return {"categories": categories, "action": action}


def predict_records(
    records: Iterable[Mapping[str, Any]], *, fake: bool = False
) -> list[dict[str, Any]]:
    """Запускает предсказатель; исключение модели помечает запись как model error."""
    predictions: list[dict[str, Any]] = []
    predictor = _fake_predict if fake else predict
    for record in records:
        try:
            response = predictor(record["text"], record["type"], record["lang"])
            if not isinstance(response, Mapping):
                predictions.append({"id": record["id"], "action": "error"})
            else:
                predictions.append({**response, "id": record["id"]})
        except Exception:
            predictions.append({"id": record["id"], "action": "error"})
    return predictions


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


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split", choices=("dev", "test"), default="test")
    parser.add_argument("--predictions", type=Path)
    parser.add_argument("--fake", action="store_true", help="детерминированный прогон без сети")
    parser.add_argument("--out", type=Path, help="записать markdown-отчёт в файл")
    args = parser.parse_args(argv)
    if args.fake and args.predictions:
        parser.error("--fake и --predictions нельзя использовать вместе")
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    records, errors = load_sets(Path(__file__).with_name("sets"))
    if errors:
        raise SystemExit("Набор не читается:\n- " + "\n- ".join(errors))
    examples = [record for record in records if record["split"] == args.split]
    if args.predictions:
        predictions = load_predictions(args.predictions, {record["id"] for record in examples})
    else:
        predictions = predict_records(examples, fake=args.fake)
    report = render_markdown(calculate_metrics(examples, predictions))
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(report + "\n", encoding="utf-8")
    print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
