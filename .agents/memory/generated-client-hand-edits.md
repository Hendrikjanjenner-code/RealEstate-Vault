---
name: Auth endpoints must live in the OpenAPI spec
description: Session/broker-login client hooks were hand-appended to generated code; decision is to move them into openapi.yaml
---

- Some auth endpoints (session, broker-login) are not in lib/api-spec/openapi.yaml; their client hooks were hand-appended to generated output, so any codegen run silently deletes them and breaks the web app.
- **Why:** generated files are owned by codegen — hand edits are non-durable by design.
- **How to apply:** treat the spec as the single source of truth. When adding or repairing endpoints, add them to openapi.yaml and regenerate rather than editing generated files. A follow-up task exists to migrate the remaining hand-appended auth hooks into the spec.
- Composite TS project references mean artifact typechecks read lib dist/*.d.ts — run the workspace-level lib build/typecheck after codegen or artifact typechecks see stale exports.
