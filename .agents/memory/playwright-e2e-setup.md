---
name: Playwright e2e setup on Replit
description: How the committed Playwright e2e suite runs in this workspace (browser binary, version pinning, run command)
---

- Suite lives in `scripts/e2e` with `scripts/playwright.config.ts`; run via `pnpm --filter @workspace/scripts run test:e2e` with both dev workflows (web + api-server) running against http://localhost:80.
- **Why:** Downloading Playwright browsers fails on NixOS (missing system libs). Instead install the Nix `playwright-driver` system dependency; it exports `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` (a patched Chromium). The config uses that as `launchOptions.executablePath`.
- **How to apply:** Pin `@playwright/test` to the version matching the Nix-provided browsers (currently 1.55.0 / chromium-1187). If the env var version changes, bump the npm package in lockstep.
- Task completion review requires committed, executable tests — a testing-subagent run alone is rejected as evidence.
