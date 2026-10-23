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

mapfile -t e2e_out < <(bash scripts/e2e-mode.sh --local)
e2e_mode=""
reason=""
for line in "${e2e_out[@]}"; do
  case "$line" in
    e2e_mode=*) e2e_mode="${line#e2e_mode=}" ;;
    reason=*) reason="${line#reason=}" ;;
  esac
done

if [[ "$e2e_mode" == full ]]; then
  step "e2e full ($reason)"
  npm run test:e2e:full
else
  step "e2e smoke ($reason)"
  npm run test:e2e:smoke
fi

printf '\n=== verify: ALL PASSED ===\n'
