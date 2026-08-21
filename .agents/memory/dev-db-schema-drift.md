---
name: Dev DB schema drift after task merges
description: Shared dev database can lag the drizzle schema when parallel tasks merge; symptoms and fix.
---

Rule: when the API starts returning 500s with drizzle "Failed query" errors referencing missing columns or relations (e.g. a column not in `\d`, or `relation does not exist`), the shared dev database has drifted behind `lib/db` schema.

**Why:** multiple tasks merge schema changes in parallel; nothing auto-pushes the dev DB, so freshly merged code queries columns/tables that don't exist yet.

**How to apply:** run `pnpm run push` in `lib/db` (drizzle-kit push). It is interactive on data-loss statements and fails without a TTY — if the only destructive change is dropping a legacy column already removed from the schema, use `pnpm run push-force`. Then restart the API server workflow if needed.
