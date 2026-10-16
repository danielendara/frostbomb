#!/usr/bin/env bash
# Read-only. Exit 1 unless 5173 answers 200 and its owner is a process whose cwd is this checkout and is our saved pid.
PORT=5173
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:$PORT/")
[ "$code" = 200 ] || { echo "FAIL: http $code"; exit 1; }
OWNER=$(ss -ltnpH "sport = :$PORT" | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
CWD=$(readlink "/proc/$OWNER/cwd" 2>/dev/null)
[ "$CWD" = "$ROOT" ] || { echo "FAIL: port owner pid ${OWNER:-none} cwd '$CWD' is not this checkout $ROOT"; exit 1; }
[ "$OWNER" = "$(cat /tmp/frostbomb-dev.pid 2>/dev/null)" ] || { echo "FAIL: owner $OWNER != saved pid"; exit 1; }
echo "owner ok: pid $OWNER cwd $CWD"
