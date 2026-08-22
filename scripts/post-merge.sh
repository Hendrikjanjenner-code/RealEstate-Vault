#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Additive, non-interactive schema sync (drizzle-kit push prompts on drift,
# so it cannot run here). See lib/db/src/sync.ts.
pnpm --filter @workspace/db run sync
