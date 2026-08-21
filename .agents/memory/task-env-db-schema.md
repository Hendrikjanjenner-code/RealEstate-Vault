---
name: Task-environment DB may lag schema
description: Isolated task environments can miss tables merged by other tasks; push schema before e2e
---

- Rule: if API routes or e2e tests fail with `relation "<table>" does not exist` (often surfacing as 500s/non-ok API responses), run `pnpm --filter @workspace/db run push` first.
- **Why:** each task runs in an isolated environment whose Postgres copy may predate tables added by recently merged tasks, even though the code/schema in the branch already references them.
- **How to apply:** before running the e2e suite or debugging mysterious 500s in a task environment, verify tables with `psql "$DATABASE_URL" -c '\dt'` and push the drizzle schema if anything from `lib/db/src/schema` is missing.
