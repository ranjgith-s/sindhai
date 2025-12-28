# Security & Privacy

## Threat model (baseline)

- Single user, self-hosted.
- Risks: exposed instance, leaked API keys, accidental external data exfiltration via AI calls.

## Controls

- **Authentication**: require login when instance is remotely accessible.
- **Transport**: enforce HTTPS (typically via reverse proxy).
- **API keys**:
  - stored server-side only
  - never exposed to the browser
  - ideally encrypted at rest (if stored persistently)
- **External AI calls**:
  - explicit user opt-in
  - clear UI indicator when content leaves the system
  - send minimal content (selected note/snippets) rather than full vault

## Privacy-first defaults

- Local embeddings on by default.
- External providers disabled until configured.
- Separate “local-only mode” switch that hard-disables all external networking from AI modules (even if keys exist).
