#!/usr/bin/env bash
# Stop the dev server started by SKILL.md Launch and assert port 5173 is free.
# Exit status is the result of the final chained check: non-zero if anything still listens or answers.
PORT=5173
if [ -s /tmp/frostbomb-dev.pgid ]; then kill -- -"$(cat /tmp/frostbomb-dev.pgid)" 2>/dev/null; fi
sleep 1
rm -f /tmp/frostbomb-dev.pid /tmp/frostbomb-dev.pgid /tmp/frostbomb-dev.log
! ss -ltnp | grep -q ":$PORT " && ! curl -sf --max-time 2 "http://127.0.0.1:$PORT/" >/dev/null && echo "port $PORT free" || { echo "FAIL: $PORT still in use"; exit 1; }
