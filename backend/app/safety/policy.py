"""Политика решения: чистая функция от валидированного ответа модели (spec §5).

Модель только классифицирует; здесь решает код. Любое сомнение — hold или refuse, не allow.
"""

from collections.abc import Callable
from dataclasses import dataclass

from app.safety.models import IMAGE_KINDS, Classification, Decision

# Порядок проверок не менять: self_harm раньше всего, allow — только в самом конце.
REFUSE_PROMPT = {"personal_info", "off_platform_contact", "prompt_injection"}


@dataclass(frozen=True)
class Thresholds:
    allow: float = 0.8
    present_min: float = 0.5
    self_harm_min: float = 0.2


def hold_error(kind: str, code: str = "model_error") -> Decision:
    return Decision(action="hold", reason_codes=[code], model_error=True, kind=kind)


def decide(
    cls: Classification,
    kind: str,
    th: Thresholds,
    verify: Callable[[str], bool] | None,
    original: str | None = None,
) -> Decision:
    """verify(text) -> True, только если текст сам прошёл проверку как allow.
    verify=None — повторная проверка не разрешена (глубже одного уровня не идём).
    original — исходный текст: rewrite/kinder, совпадающий с ним, не принимается."""

    def fresh(alt: str | None) -> bool:
        if not alt or not alt.strip():
            return False
        return original is None or alt.strip().casefold() != original.strip().casefold()

    v = cls.verdicts()
    present = [c for c, x in v.items() if x.present]

    # Любой сигнал самоповреждения — ребёнку поддержка, взрослым «срочно»; сомнение тоже срочно.
    sh = v["self_harm"]
    if sh.present:
        return Decision(
            action="support", categories=present, reason_codes=["self_harm"], urgent=True, kind=kind
        )
    if sh.confidence < th.allow:
        return Decision(
            action="hold",
            categories=present,
            reason_codes=["low_confidence", "self_harm"],
            urgent=True,
            kind=kind,
        )

    # серая зона: «нет» с низкой уверенностью или «есть» с низкой уверенностью
    grey = any(
        (x.present and x.confidence < th.present_min)
        or (not x.present and x.confidence < th.allow)
        for x in v.values()
    )
    if grey:
        return Decision(
            action="hold", categories=present, reason_codes=["low_confidence", *present], kind=kind
        )

    if not present:
        return Decision(action="allow", kind=kind)

    if kind in IMAGE_KINDS:
        return Decision(action="hold", categories=present, reason_codes=list(present), kind=kind)

    if kind == "prompt":
        if present == ["unsafe_content"]:
            if fresh(cls.rewrite) and verify is not None and verify(cls.rewrite):
                return Decision(
                    action="rewrite",
                    categories=present,
                    reason_codes=list(present),
                    safe_text=cls.rewrite,
                    kind=kind,
                )
            return Decision(
                action="refuse",
                categories=present,
                reason_codes=[*present, "rewrite_failed"],
                kind=kind,
            )
        return Decision(action="refuse", categories=present, reason_codes=list(present), kind=kind)

    if kind == "comment" and present == ["bullying"]:
        if fresh(cls.kinder) and verify is not None and verify(cls.kinder):
            return Decision(
                action="kinder",
                categories=present,
                reason_codes=list(present),
                safe_text=cls.kinder,
                kind=kind,
            )
        codes = [*present, "kinder_failed"] if cls.kinder else list(present)
        return Decision(action="hold", categories=present, reason_codes=codes, kind=kind)

    return Decision(action="hold", categories=present, reason_codes=list(present), kind=kind)
