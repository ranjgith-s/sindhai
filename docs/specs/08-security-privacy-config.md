# Security, Privacy, and Configuration Spec

## Baseline assumptions

- Single-user, self-hosted.
- Main risks: exposed instance, leaked API keys, accidental external data exfiltration.

## Authentication (MVP)

One of the following must be true for MVP deployments:
- Instance is protected behind a reverse proxy with auth, or
- The API implements a minimal auth mechanism (token/session) for non-localhost access.

Auth choice is TBD; if a concrete choice is made, capture it in an ADR.

## Transport security

- HTTPS is required for remote access (enforced by reverse proxy in typical deployments).

## Secrets handling

- Provider API keys are stored server-side only.
- Do not log secrets.
- If stored persistently, encrypt at rest (optional for MVP; required before multi-user).

## External AI controls (hard requirements)

- `AI_EXTERNAL_ENABLED` must default to `false`.
- When `AI_EXTERNAL_ENABLED=false`, all external provider routes return `403` and do not attempt network calls.
- The UI must still show local AI features without external access.

## Vault protection

- API must validate and sanitize `path` inputs to prevent directory traversal and unintended file access.
- API must restrict operations to files under `VAULT_DIR`.

## Observability (MVP)

- Log request ids and high-level actions (create/update/delete/index), but never log full note content by default.
- Provide a debug mode that is opt-in and redacts content by default.

