---
name: Broken-merge route corruption
description: Merges can scramble Express route files in ways that still typecheck; verify semantics, not just build.
---

Merges here have repeatedly scrambled api-server route files: handler bodies swapped between routes and wrong zod schemas applied, sometimes still typechecking while misbehaving at runtime.

**Why:** parallel task merges interleave hunks badly; typecheck alone can't catch semantically wrong-but-valid code, and re-merges can reintroduce the corruption after a fix.

**How to apply:** on a baffling validation error or mismatched schema/handler pairing, diff the file against its last good commit and restore, keeping only the intended changes. After any rebase, rerun typecheck AND a live request/e2e pass — earlier repairs may have been silently reverted.
