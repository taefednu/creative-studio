import pytest

from app.meta.client import ContentPolicyViolation, ModelError, ModelTimeout

MSG = [{"role": "user", "content": "hi"}]
SCHEMA = {"name": "s", "schema": {"type": "object"}}


def call(c):
    return c.chat_json(MSG, SCHEMA, timeout=5)


@pytest.mark.parametrize(
    "mode,expected",
    [
        ("valid", '"allow"'),
        ("garbage_json", "{not json"),
        ("extra_key", '"extra"'),
        ("unknown_category", '"zzz"'),
        ("empty", ""),
    ],
)
def test_content_modes_returned_raw(fake_client, mode, expected):
    # клиент ничего не решает: сырой ответ уходит классификатору, тот проверяет схему
    c, fake, _ = fake_client(mode)
    assert expected in call(c)
    assert fake.calls == 1


def test_content_policy(fake_client):
    c, fake, _ = fake_client("content_policy")
    with pytest.raises(ContentPolicyViolation):
        call(c)
    assert fake.calls == 1


def test_timeout(fake_client):
    c, _, _ = fake_client("timeout")
    with pytest.raises(ModelTimeout):
        call(c)


@pytest.mark.parametrize("mode,status", [("http_429", 429), ("http_503", 503)])
def test_retry_twice_then_error(fake_client, mode, status):
    c, fake, sleeps = fake_client(mode)
    with pytest.raises(ModelError) as ei:
        call(c)
    assert ei.value.status == status
    assert fake.calls == 3  # первый вызов + 2 повтора
    assert len(sleeps) == 2


def test_500_no_retry(fake_client):
    c, fake, sleeps = fake_client("http_500")
    with pytest.raises(ModelError):
        call(c)
    assert fake.calls == 1
    assert sleeps == []


def test_backoff_starts_at_500ms(fake_client):
    c, _, sleeps = fake_client("http_503")
    with pytest.raises(ModelError):
        call(c)
    assert sleeps[0] >= 0.5 and sleeps[1] >= 1.0
