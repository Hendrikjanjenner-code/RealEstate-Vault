---
name: Custom code in generated API client
description: Codegen wipes hand-edits in generated client/zod output; custom hooks live outside generated dirs.
---

Never hand-edit generated API client/zod files — codegen cleans and rewrites them, silently deleting hand-appended code.

**Why:** Hand-appended auth hooks in generated output were wiped by a later regen, breaking unrelated pages.

**How to apply:** New endpoints go in the OpenAPI spec; truly custom client code goes in the api-client-react package's non-generated `custom-endpoints.ts`. After regenerating, run the workspace typecheck to catch spec/generated drift.
