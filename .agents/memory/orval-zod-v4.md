---
name: Orval zod codegen needs zod/v4 import
description: Generated api-zod code uses zod v4 APIs; the codegen script rewrites the import.
---

Orval v8's zod client emits zod v4 APIs (e.g. `zod.int()`), but the workspace catalog pins zod 3.25.x whose top-level `zod` import is the v3 API.

**Why:** `pnpm --filter @workspace/api-spec run codegen` failed typecheck with `Property 'int' does not exist` until the generated import was rewritten to `zod/v4` (which zod 3.25+ ships as a subpath).

**How to apply:** The codegen script in `lib/api-spec/package.json` includes a `sed` step rewriting `from 'zod'` to `from 'zod/v4'` in the generated file. Keep that step when touching the codegen pipeline; do not hand-edit generated files.

Related: generated response schemas use plain `zod.string()` for date-time fields, so API routes must JSON-serialize DB rows (Date → ISO string) before `.parse()` — see the `toJson` helper in the api-server.

Seed scripts: `tsx` is not installed; bundle with `pnpm exec esbuild src/seed.ts --bundle --platform=node --format=esm --external:pg-native` and run the output with node.
