#!/usr/bin/env bash
# Single source of truth for smoke vs full Playwright (and CI skip_playwright).
# Emits GitHub Actions output lines: skip_playwright, e2e_mode, reason.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

force_full=false
force_smoke=false
scope=""

usage() {
  echo "usage: scripts/e2e-mode.sh [--force-full|--force-smoke] --local | --push | --pr <base-ref> | --dispatch" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force-full) force_full=true; shift ;;
    --force-smoke) force_smoke=true; shift ;;
    --local) scope=local; shift ;;
    --push) scope=push; shift ;;
    --dispatch) scope=dispatch; shift ;;
    --pr)
      scope=pr
      pr_base="${2:?--pr requires base ref}"
      shift 2
      ;;
    -h|--help) usage ;;
    *) echo "unknown argument: $1" >&2; usage ;;
  esac
done

[[ -n "$scope" ]] || usage

emit() {
  local skip="$1" mode="$2" reason="$3"
  printf 'skip_playwright=%s\n' "$skip"
  printf 'e2e_mode=%s\n' "$mode"
  printf 'reason=%s\n' "$reason"
}

if [[ "$scope" == dispatch ]]; then
  if [[ "$force_full" == true ]]; then
    emit false full "--force-full (workflow_dispatch)"
  else
    emit false smoke "--force-smoke (workflow_dispatch)"
  fi
  exit 0
fi

collect_changed() {
  local -n _out=$1
  _out=()
  case "$scope" in
    local)
      local base=""
      if git rev-parse --verify origin/main >/dev/null 2>&1; then
        base="$(git merge-base origin/main HEAD 2>/dev/null || true)"
      fi
      if [[ -z "$base" ]]; then
        emit false full "origin/main unavailable; defaulting to full e2e"
        return 1
      fi
      mapfile -t committed < <(git diff --name-only "$base" HEAD 2>/dev/null || true)
      mapfile -t unstaged < <(git diff --name-only "$base" 2>/dev/null || true)
      mapfile -t untracked < <(git ls-files --others --exclude-standard 2>/dev/null || true)
      _out=("${committed[@]}" "${unstaged[@]}" "${untracked[@]}")
      ;;
    pr)
      mapfile -t _out < <(git diff --name-only "${pr_base}...HEAD")
      ;;
    push)
      mapfile -t _out < <(git diff --name-only HEAD~1 HEAD 2>/dev/null || true)
      if [[ ${#_out[@]} -eq 0 ]]; then
        mapfile -t _out < <(git ls-files)
      fi
      ;;
  esac
}

declare -a changed=()
if ! collect_changed changed; then
  exit 0
fi

# De-dupe while preserving order
declare -A seen=()
declare -a unique=()
for f in "${changed[@]}"; do
  [[ -n "$f" ]] || continue
  [[ -n "${seen[$f]+x}" ]] && continue
  seen[$f]=1
  unique+=("$f")
done
changed=("${unique[@]}")

if [[ ${#changed[@]} -eq 0 ]]; then
  emit false full "empty diff; defaulting to full e2e"
  exit 0
fi

e2e_mode=smoke
skip_playwright=false
reason="no full-e2e paths in diff"

if [[ "$force_full" == true ]]; then
  e2e_mode=full
  reason="--force-full"
elif [[ "$force_smoke" == true ]]; then
  e2e_mode=smoke
  reason="--force-smoke"
fi

docs_only=true
dependabot_lock_only=true
for f in "${changed[@]}"; do
  case "$f" in
    *.md|docs/*|LICENSE) ;;
    *) docs_only=false ;;
  esac
  case "$f" in
    package-lock.json|pnpm-lock.yaml|yarn.lock) ;;
    *) dependabot_lock_only=false ;;
  esac

  if [[ "$force_full" == false && "$force_smoke" == false ]]; then
    if [[ "$f" == src/snowflake/* ]] \
      || [[ "$f" == src/ui/* ]] \
      || [[ "$f" == src/main.ts ]] \
      || [[ "$f" == src/style.css ]] \
      || [[ "$f" == index.html ]] \
      || [[ "$f" == playwright.config.ts ]] \
      || [[ "$f" == vite.config.ts ]] \
      || { [[ "$f" == src/* ]] && [[ "$f" =~ (canvas|webgl|export) ]]; } \
      || { [[ "$f" == tests/* ]] && [[ "$f" != *.smoke.spec.ts ]]; }; then
      e2e_mode=full
      reason="diff touches $f"
    fi
  fi
done

if [[ "$scope" == pr || "$scope" == push ]]; then
  if [[ "$docs_only" == true ]]; then
    skip_playwright=true
    reason="docs-only change"
  fi
  if [[ "${GITHUB_ACTOR:-}" == "dependabot[bot]" && "$dependabot_lock_only" == true ]]; then
    skip_playwright=true
    reason="dependabot lockfile-only change"
  fi
fi

emit "$skip_playwright" "$e2e_mode" "$reason"
