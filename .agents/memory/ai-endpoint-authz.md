---
name: AI output confidentiality policy
description: Durable rules for exposing AI-generated content on deals with tiered access
---
When AI output is generated over data users have tiered access to:
- Redact confidential facts from the model prompt itself for lesser-privileged requesters — anything a model sees can round-trip into stored output.
- Persisted AI output must carry the access class of the context it was generated with, and read paths must never serve higher-class output to lower-class viewers.
- Flags like "restricted" must record the access class explicitly at write time, never be inferred from proxies such as document counts.
- Stored AI conversation history must be re-authorized against current access on every read (revocation hides full-context replies).
- Validate model output strictly: reject (and store as a failed, audited run) any malformed field or source reference to a non-existent location — no coercion, no truncation of invalid values.
**Why:** anything less creates disclosure paths via shared cached output, stale history, or model echoes of confidential context.
**How to apply:** every new AI or aggregate endpoint resolves the viewer's access server-side and applies the same redaction and provenance gating before generating, storing, or returning AI content.
