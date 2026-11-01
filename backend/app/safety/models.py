"""Типы проверки безопасности и строгая валидация ответа модели (spec §5)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictFloat, StrictInt, StrictStr

Kind = Literal["prompt", "caption", "comment", "nickname", "assignment", "image_result", "upload"]
IMAGE_KINDS = ("image_result", "upload")
Action = Literal["allow", "rewrite", "kinder", "refuse", "hold", "support"]

CATEGORIES = (
    "personal_info",
    "off_platform_contact",
    "bullying",
    "unsafe_content",
    "self_harm",
    "prompt_injection",
)

MAX_TEXT = 2000


class Decision(BaseModel):
    """Результат проверки; JSON-сериализуем для очереди «Задержано»."""

    action: Action
    categories: list[str] = Field(default_factory=list)  # present=true
    reason_codes: list[str] = Field(default_factory=list)
    safe_text: str | None = None
    model_error: bool = False
    review_by: Literal["parent", "teacher", "both"] | None = None  # решают тикеты #6-#9
    urgent: bool = False
    kind: str = ""


class CategoryVerdict(BaseModel):
    model_config = ConfigDict(extra="forbid")
    present: StrictBool
    confidence: StrictInt | StrictFloat = Field(ge=0, le=1)


class Categories(BaseModel):
    model_config = ConfigDict(extra="forbid")
    personal_info: CategoryVerdict
    off_platform_contact: CategoryVerdict
    bullying: CategoryVerdict
    unsafe_content: CategoryVerdict
    self_harm: CategoryVerdict
    prompt_injection: CategoryVerdict


class Classification(BaseModel):
    model_config = ConfigDict(extra="forbid")
    categories: Categories
    rewrite: StrictStr | None = Field(max_length=MAX_TEXT)
    kinder: StrictStr | None = Field(max_length=MAX_TEXT)

    def verdicts(self) -> dict[str, CategoryVerdict]:
        return {c: getattr(self.categories, c) for c in CATEGORIES}


def _verdict_schema() -> dict:
    return {
        "type": "object",
        "properties": {"present": {"type": "boolean"}, "confidence": {"type": "number"}},
        "required": ["present", "confidence"],
        "additionalProperties": False,
    }


SCHEMA = {
    "name": "safety_classification",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "categories": {
                "type": "object",
                "properties": {c: _verdict_schema() for c in CATEGORIES},
                "required": list(CATEGORIES),
                "additionalProperties": False,
            },
            "rewrite": {"type": ["string", "null"]},
            "kinder": {"type": ["string", "null"]},
        },
        "required": ["categories", "rewrite", "kinder"],
        "additionalProperties": False,
    },
}
