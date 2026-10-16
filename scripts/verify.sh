#!/usr/bin/env bash
# Local verify entrypoint (CI is local-only). Mirrors .github/workflows/ci.yml, fail-fast.
# Not present in this repo, so not run: lint (no linter), coverage gate (no coverage provider).
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n=== verify: %s ===\n' "$1"; }

step "typecheck (app)";    npx tsc --noEmit
step "typecheck (tests)";  npm run typecheck:tests
step "unit tests";         npm run test:unit
step "build";              npx vite build
step "e2e smoke";          npm run test:e2e:smoke

printf '\n=== verify: ALL PASSED ===\n'
