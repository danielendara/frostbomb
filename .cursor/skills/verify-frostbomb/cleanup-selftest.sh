#!/usr/bin/env bash
# Proves cleanup.sh fails (non-zero) when a stray listener survives, and passes once it is gone.
# Needs port 5173 free at start.
DIR="$(cd "$(dirname "$0")" && pwd)"
if ss -ltn | grep -q ':5173 '; then echo "SELFTEST ABORT: 5173 already in use"; exit 2; fi
setsid python3 -m http.server 5173 --bind 127.0.0.1 >/dev/null 2>&1 &
STRAY=$!
trap 'kill "$STRAY" 2>/dev/null' EXIT
until curl -sf --max-time 1 http://127.0.0.1:5173/ >/dev/null; do sleep 0.2; done
bash "$DIR/cleanup.sh"; rc=$?
echo "cleanup with stray listener: exit $rc"
[ "$rc" -ne 0 ] || { echo "SELFTEST FAIL: cleanup exited 0 with a survivor"; exit 1; }
kill "$STRAY"; wait "$STRAY" 2>/dev/null
bash "$DIR/cleanup.sh"; rc=$?
echo "cleanup after stray killed: exit $rc"
[ "$rc" -eq 0 ] || { echo "SELFTEST FAIL: cleanup non-zero on a free port"; exit 1; }
echo "SELFTEST PASS"
