# ADR 0004: OpenAI AI Writing via Server Proxy Only

## Context

The product includes “AI writing” actions (rewrite/expand/grammar fix/continue) that may use an OpenAI-compatible provider.

We must keep the system privacy-first and consistent with the local-first design:
- external providers are opt-in and gated (`AI_EXTERNAL_ENABLED=false` by default)
- vault-wide data must never be sent externally
- secrets must not be exposed in the browser

## Decision

- The web app will never store, request, or use provider API keys directly.
- All OpenAI-compatible calls are made server-side via `POST /integrations/openai/chat`.
- The UI defaults to sending only explicit user-selected text; whole-note operations require explicit confirmation.

## Consequences

- **Pros:** avoids leaking API keys; centralizes external-call policy enforcement; easier to audit and throttle.
- **Cons:** requires backend availability for external AI features; user cannot “just paste a key” in the browser without changing this decision.

