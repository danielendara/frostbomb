---
name: verify-frostbomb
description: Drive the Frostbomb snowflake web app (Vite + three.js, Cloudflare Worker) locally like a user with Playwright and capture screenshots/transcripts as proof. Use when verifying any UI or behavior change, or before opening a PR.
---

# Verify Frostbomb

Surface: a single-page web app (canvas crystal, Lab Mode, share/export, URL state) plus a tiny Worker (`/api/client-error`). Everything runs locally; CI is local-only, so `npm run verify` is the gate.

## Launch
```bash
npm ci && npx playwright install chromium     # once
setsid ./node_modules/.bin/vite --host 127.0.0.1 --port 5173 > /tmp/frostbomb-dev.log 2>&1 &
until curl -sf http://127.0.0.1:5173/ >/dev/null; do sleep 1; done
# record the real port owner: `$!` can be a setsid wrapper that forks and exits, depending on the shell
ss -ltnpH 'sport = :5173' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 > /tmp/frostbomb-dev.pid
ps -o pgid= -p "$(cat /tmp/frostbomb-dev.pid)" | tr -d ' ' > /tmp/frostbomb-dev.pgid
```
Ready = `/` returns HTML (the app needs no env vars, DB, auth or seed data; state lives in the URL, e.g. `/?seed=abcde`). Playwright's own `webServer` (playwright.config.ts) starts the same command on 5173 and reuses a running one, so a manual instance doubles as the e2e server.

## Doctor (read-only)
```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5173/        # 200
kill -0 "$(cat /tmp/frostbomb-dev.pid)" && echo up
# the port owner must be our saved pid (not an npx wrapper or another checkout's server)
OWNER=$(ss -ltnpH 'sport = :5173' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
[ "$OWNER" = "$(cat /tmp/frostbomb-dev.pid)" ] && echo "owner ok: $OWNER" || { echo "FAIL: port owner $OWNER != saved pid"; false; }
```

## Drive
Playwright (already a devDependency). Stable handles: `#seed-display`, `#lab-toggle`, `#lab-status` (reads `ON` once the Tweakpane chunk loads), `#habit-chips .habit-chip[data-habit=…]`, `#stat-habit`. Helper:
```bash
node .cursor/skills/verify-frostbomb/scripts/drive-habit-chips.mjs http://127.0.0.1:5173 "$EVIDENCE_DIR"
```
Worker endpoint by curl:
```bash
curl -si -X POST http://127.0.0.1:5173/api/client-error -H 'content-type: application/json' -d '{"kind":"error","message":"verify-probe","build":"verify","ua":"other"}'
```
Feature map: `features/README.md`. Existing specs in `tests/*.spec.ts` show selectors for every other feature; `npm run test:e2e:smoke` is the scripted subset.

## Evidence
Save under `$EVIDENCE_DIR` (outside the repo, e.g. `/workspace/verify-<date>/frostbomb-evidence/`): before/after screenshots, the helper transcript, curl bodies, `npm run verify` log. Exercise the real path (click the UI, press Back), capture action and resulting state (URL + `#stat-habit` text + screenshot), not internal setters. For logic changes attach test output; for a fix also prove mutation: revert the fix, show the new test fails, restore.

## Isolation
Fixed port 5173 (playwright.config.ts `baseURL`). Do not start a second instance on 5173; if the doctor shows a port owner you did not start, stop and use another instance only via `--port` for manual driving (e2e specs assume 5173). No persistent data dirs; browsers are fresh contexts.

## Cleanup
```bash
bash .cursor/skills/verify-frostbomb/cleanup.sh
```
Kills the saved process group, then one chained check prints `port 5173 free` and exits 0 only if nothing listens on 5173 and the health URL fails; otherwise it prints `FAIL: 5173 still in use` and exits 1. Check the exit code, not just the last line. `bash .cursor/skills/verify-frostbomb/cleanup-selftest.sh` proves this against a deliberate stray listener (needs 5173 free).

Launch the binary `./node_modules/.bin/vite` directly under `setsid` (not `npx` or `npm run dev`: those wrappers' PIDs differ from the vite process that owns the port), and kill by process group. Never `pkill`. Evidence directory is kept.

## Gates
`npm run verify` = tsc --noEmit, typecheck:tests, vitest, vite build, Playwright smoke. There is no linter and no coverage provider in the repo, so those gates do not exist yet.
