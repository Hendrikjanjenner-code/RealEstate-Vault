---
name: Replit Auth monorepo quirks
description: Fixes needed when wiring the replit-auth skill templates into this pnpm monorepo.
---

- The copied `lib/replit-auth-web` template tsconfig lacks `composite: true` (plus `declarationMap`/`emitDeclarationOnly`), which the root project-references build requires. **Why:** typecheck fails with TS6306/TS6305 otherwise. **How to apply:** mirror `lib/api-client-react/tsconfig.json` compiler options.
- Its `use-auth.ts` uses `import.meta.env`, which fails standalone compilation; a local `src/vite-env.d.ts` declaring `ImportMeta.env.BASE_URL` fixes it.
- Session snapshots (users row copied into `sessions.sess.user`) go stale when user rows change (e.g. role updates) — routes that mutate the user must also `updateSession(sid, ...)` or `req.user` keeps the old data.
- Marketplace access model: viewer's `accessStatus` is computed server-side per deal (owner / nda_signed => granted); confidential fields and NDA-required docs are redacted in the API. Seeded deals have `broker_user_id` NULL and are manageable by any broker-role user as a legacy fallback.
