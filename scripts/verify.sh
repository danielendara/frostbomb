#!/usr/bin/env bash
# Local verify entrypoint (CI is local-only). Mirrors .github/workflows/ci.yml, fail-fast.
# Not present in this repo, so not run: lint (no linter), coverage gate (no coverage provider).
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n=== verify: %s ===\n' "$1"; }

step "AGENTS.md policy";   node scripts/check-agents-md.mjs
step "typecheck (app)";    npx tsc --noEmit
step "typecheck (tests)";  npm run typecheck:tests
step "unit tests";         npm run test:unit
step "build";              npx vite build
step "three chunk budget"; node scripts/check-three-chunk-budget.mjs
step "e2e smoke";          npm run test:e2e:smoke
step "startup long-task budget"; (
  PERF_PORT=8765
  python3 -m http.server "$PERF_PORT" --bind 127.0.0.1 --directory dist/client >/tmp/frostbomb-perf-http.log 2>&1 &
  PERF_PID=$!
  trap 'kill "$PERF_PID" 2>/dev/null || true' EXIT
  sleep 1
  FROSTBOMB_PERF_URL="http://127.0.0.1:${PERF_PORT}" npx playwright test tests/startup-long-task-budget.smoke.spec.ts --project=sequential-smoke
)

printf '\n=== verify: ALL PASSED ===\n'
