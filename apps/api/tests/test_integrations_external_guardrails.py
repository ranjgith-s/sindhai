from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from sindhai_api.dependencies import get_settings


@pytest.fixture(autouse=True)
def clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_external_integrations_blocked_when_disabled(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("VAULT_DIR", str(tmp_path))
    monkeypatch.setenv("AI_EXTERNAL_ENABLED", "false")

    from main import create_app

    client = TestClient(create_app())

    r1 = client.post("/integrations/openai/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r1.status_code == 403

    r2 = client.post("/integrations/perplexity/ask", json={"query": "hello"})
    assert r2.status_code == 403


def test_external_integrations_require_provider_config(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("VAULT_DIR", str(tmp_path))
    monkeypatch.setenv("AI_EXTERNAL_ENABLED", "true")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("PERPLEXITY_API_KEY", raising=False)

    from main import create_app

    client = TestClient(create_app())

    r1 = client.post("/integrations/openai/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r1.status_code == 400
    assert "provider_not_configured" in r1.text

    r2 = client.post("/integrations/perplexity/ask", json={"query": "hello"})
    assert r2.status_code == 400
    assert "provider_not_configured" in r2.text


def test_external_payload_size_limit_enforced(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("VAULT_DIR", str(tmp_path))
    monkeypatch.setenv("AI_EXTERNAL_ENABLED", "true")
    monkeypatch.setenv("AI_EXTERNAL_MAX_CHARS", "10")
    monkeypatch.setenv("OPENAI_API_KEY", "test")

    import main

    client = TestClient(main.create_app())

    r = client.post(
        "/integrations/openai/chat",
        json={"messages": [{"role": "user", "content": "this is too long"}]},
    )
    assert r.status_code == 400
    assert "external_payload_too_large" in r.text


def test_openai_chat_returns_saveable_markdown(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("VAULT_DIR", str(tmp_path))
    monkeypatch.setenv("AI_EXTERNAL_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test")

    import main

    def fake_chat(**_kwargs):
        from sindhai_api.ai.providers import ChatResponse

        return ChatResponse(provider="external:openai:test-model", content="Hello", raw={"ok": True})

    # Updated patch target
    monkeypatch.setattr("sindhai_api.interface.api.routes.openai_chat_completion", fake_chat)
    monkeypatch.setattr("sindhai_api.interface.api.routes.rfc3339_now", lambda: "2025-01-01T00:00:00Z")

    client = TestClient(main.create_app())
    r = client.post("/integrations/openai/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 200
    data = r.json()
    assert data["provider"] == "external:openai:test-model"
    assert data["content"] == "Hello"
    assert "generated_at" in data["save_markdown"]
    assert "## Prompt" in data["save_markdown"]
    assert "## Response" in data["save_markdown"]
