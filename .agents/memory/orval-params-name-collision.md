---
name: Orval params name collision
description: Why an OpenAPI operation with both path and query params breaks api-zod codegen
---

When an OpenAPI operation defines both path parameters and query parameters, orval generates a zod schema `<Op>Params` (path) in api-zod's api.ts AND a type `<Op>Params` (query) in api-zod's types — both re-exported from index.ts, causing TS2308 "already exported a member".

**Why:** orval derives both names from the operationId, so any operation mixing path and query params collides at the re-export layer.

**How to apply:** for endpoints needing both, omit the query param from the spec and validate it manually in the Express handler, or rename to avoid the clash.
