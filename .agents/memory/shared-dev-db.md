---
name: Shared dev DB across task branches
description: Policy for changing the dev database schema safely when parallel task branches share one database
---

- All in-flight task branches share the single dev PostgreSQL database, but each branch carries only its own drizzle schema code.
- **Why:** `drizzle-kit push` diffs the DB against the current branch's schema, so it proposes dropping columns/tables that belong to other branches' work — real data loss for those tasks.
- **How to apply:** For schema drift errors ("column/relation does not exist"), apply only additive statements (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`). Only run a full push when confident nothing from another branch would be dropped (review the push plan output first; never `--force` blindly).
