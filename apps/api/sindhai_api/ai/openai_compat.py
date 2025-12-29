from __future__ import annotations

from dataclasses import asdict

import httpx

from .providers import ChatResponse, Message


class ExternalAIError(RuntimeError):
    pass


def _join_base(base_url: str, path: str) -> str:
    return base_url.rstrip("/") + "/" + path.lstrip("/")


def openai_chat_completion(
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[Message],
    timeout_s: float = 30.0,
) -> ChatResponse:
    url = _join_base(base_url, "/v1/chat/completions")
    payload = {
        "model": model,
        "messages": [asdict(m) for m in messages],
        "temperature": 0.2,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    try:
        with httpx.Client(timeout=timeout_s) as client:
            resp = client.post(url, headers=headers, json=payload)
    except Exception as e:
        raise ExternalAIError("external_request_failed") from e

    if resp.status_code >= 400:
        raise ExternalAIError(f"external_http_{resp.status_code}")

    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        if not isinstance(content, str):
            raise ExternalAIError("external_bad_response")
        return ChatResponse(provider=f"external:openai:{model}", content=content, raw=data)
    except Exception as e:
        if isinstance(e, ExternalAIError):
            raise
        raise ExternalAIError("external_bad_response") from e


def perplexity_ask(
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[Message],
    timeout_s: float = 30.0,
) -> tuple[ChatResponse, list[str]]:
    """
    Uses an OpenAI-compatible chat completions endpoint when available.
    Returns (chat_response, citations).
    """
    url = _join_base(base_url, "/v1/chat/completions")
    payload = {
        "model": model,
        "messages": [asdict(m) for m in messages],
        "temperature": 0.2,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    try:
        with httpx.Client(timeout=timeout_s) as client:
            resp = client.post(url, headers=headers, json=payload)
    except Exception as e:
        raise ExternalAIError("external_request_failed") from e

    if resp.status_code >= 400:
        raise ExternalAIError(f"external_http_{resp.status_code}")

    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        if not isinstance(content, str):
            raise ExternalAIError("external_bad_response")
        citations_raw = data.get("citations") or data.get("references") or []
        citations: list[str] = [c for c in citations_raw if isinstance(c, str)]
        return (ChatResponse(provider=f"external:perplexity:{model}", content=content, raw=data), citations)
    except Exception as e:
        if isinstance(e, ExternalAIError):
            raise
        raise ExternalAIError("external_bad_response") from e

