---
name: Replit Auth monorepo quirks
description: Fixes needed when wiring the replit-auth skill templates into this pnpm monorepo.
---

- The copied `lib/replit-auth-web` template tsconfig lacks `composite: true` (plus `declarationMap`/`emitDeclarationOnly`), which the root project-references build requires. **Why:** typecheck fails with TS6306/TS6305 otherwise. **How to apply:** mirror `lib/api-client-react/tsconfig.json` compiler options.
- Its `use-auth.ts` uses `import.meta.env`, which fails standalone compilation; a local `src/vite-env.d.ts` declaring `ImportMeta.env.BASE_URL` fixes it.
- Session snapshots (users row copied into `sessions.sess.user`) go stale when user rows change (e.g. role updates) — routes that mutate the user must also `updateSession(sid, ...)` or `req.user` keeps the old data.
- OIDC login cannot be tested via localhost: the callback origin is built as https://<host>, so https://localhost/api/callback is unreachable. Log in via the public $REPLIT_DEV_DOMAIN instead — its session cookie is also what the Expo web preview (different subdomain) relies on.
- The shared API client must send fetch credentials: 'include' or the Expo web preview (cross-origin to the API) gets 401s despite a valid dev-domain session; server CORS already allows credentials.
- Marketplace access model: viewer's `accessStatus` is computed server-side per deal (owner / nda_signed => granted); confidential fields and NDA-required docs are redacted in the API. Seeded deals have `broker_user_id` NULL and are manageable by any broker-role user as a legacy fallback.
