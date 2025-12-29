from __future__ import annotations

from fastapi.testclient import TestClient


def test_ai_endpoints_local_only_by_default(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("VAULT_DIR", str(tmp_path))
    monkeypatch.delenv("QDRANT_URL", raising=False)
    monkeypatch.delenv("NEO4J_URI", raising=False)
    monkeypatch.delenv("NEO4J_USERNAME", raising=False)
    monkeypatch.delenv("NEO4J_PASSWORD", raising=False)
    monkeypatch.delenv("AI_EXTERNAL_ENABLED", raising=False)

    from main import create_app

    client = TestClient(create_app())

    created = client.post(
        "/notes",
        json={"title": "Test", "content_markdown": "---\nfoo: bar\n---\n\nPara 1\n\nPara 2\n", "frontmatter": {}},
    )
    assert created.status_code == 200
    note_id = created.json()["id"]

    r = client.post("/ai/summarize", json={"noteId": note_id, "mode": "local", "provider": None})
    assert r.status_code == 200
    body = r.json()
    assert body["provider"].startswith("local:")
    assert "Para 1" in body["summary_markdown"]

    r2 = client.post("/ai/summarize", json={"noteId": note_id, "mode": "external"})
    assert r2.status_code == 403

    # Without a vector store configured, suggestions are empty (MVP-safe fallback).
    r3 = client.get(f"/ai/suggest-links?noteId={note_id}&k=5")
    assert r3.status_code == 200
    assert r3.json()["items"] == []

    r4 = client.get(f"/ai/suggest-tags?noteId={note_id}&k=10")
    assert r4.status_code == 200
    assert r4.json()["items"] == []

