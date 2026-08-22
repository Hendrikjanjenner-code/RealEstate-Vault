---
name: OpenAPI spec merge drift
description: Parallel task merges can silently drop endpoints/fields from the OpenAPI spec while stale generated clients keep them
---

- After parallel task merges, the committed generated API clients can be AHEAD of the OpenAPI spec: a merge loses a yaml hunk while the generated code and the server/app code using that endpoint survive. Regenerating then silently deletes exports the app still imports, or strips response fields during zod parsing.
- **Why:** A routine codegen run broke the web app and NDA flows even though no app code had changed — the spec had quietly lost endpoints/fields in earlier merges. The same drift can also drop whole server route handlers while spec and UI keep referencing them.
- **How to apply:** After running codegen, diff the generated packages and treat any *removed* export or field as suspected merge drift, not dead code. Grep server and app code for usage; if used, restore the spec entry (its prior shape is recoverable from the pre-regen generated code in git history) before trusting the regeneration.
