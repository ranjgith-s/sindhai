from __future__ import annotations

from fastapi.testclient import TestClient


def test_request_id_header_present(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("VAULT_DIR", str(tmp_path))
    from main import create_app

    client = TestClient(create_app())
    r = client.get("/health")
    assert r.status_code == 200
    assert r.headers.get("x-request-id")


def test_bearer_auth_blocks_when_enabled(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("VAULT_DIR", str(tmp_path))
    monkeypatch.setenv("API_AUTH_MODE", "bearer")
    monkeypatch.setenv("API_AUTH_TOKEN", "secret")

    from main import create_app

    client = TestClient(create_app())

    # Health is exempt so containers can be checked.
    r0 = client.get("/health")
    assert r0.status_code == 200

    r1 = client.get("/notes")
    assert r1.status_code == 401

    r2 = client.get("/notes", headers={"Authorization": "Bearer secret"})
    assert r2.status_code == 200

