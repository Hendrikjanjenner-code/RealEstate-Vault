---
name: Dev DB schema drift after task merges
description: Shared dev database can lag the drizzle schema when parallel tasks merge; symptoms and fix.
---

Rule: when the API starts returning 500s with drizzle "Failed query" errors referencing missing columns or relations (e.g. a column not in `\d`, or `relation does not exist`), the shared dev database has drifted behind `lib/db` schema.

**Why:** multiple tasks merge schema changes in parallel; nothing auto-pushes the dev DB, so freshly merged code queries columns/tables that don't exist yet. `drizzle-kit push` prompts interactively on any data-loss/uncertain statement and dies without a TTY, so one drift item can block all pushes.

**How to apply:** run `pnpm run push` in `lib/db`. If it is blocked by an interactive prompt: when the only destructive change is dropping a legacy column already removed from the schema, `pnpm run push-force` is safe; otherwise diagnose with `psql "$DATABASE_URL" -c "\d <table>"` vs the schema file and apply missing tables/columns additively via psql (never drop other in-flight tasks' columns — see shared-dev-db.md). Then restart the API server workflow and re-run tests. New NOT NULL/flag columns may need backfill on seeded rows.
