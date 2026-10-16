#!/usr/bin/env bash
# Start this checkout's vite on 5173. Refuses (exit 1) if 5173 is already taken: never adopts a foreign server.
PORT=5173
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
if ss -ltnH "sport = :$PORT" | grep -q .; then
  echo "REFUSE: $PORT already in use ($(ss -ltnpH "sport = :$PORT" | grep -o 'pid=[0-9]*' | head -1)); not ours, stop"
  exit 1
fi
cd "$ROOT" || exit 1
setsid ./node_modules/.bin/vite --host 127.0.0.1 --port $PORT --strictPort > /tmp/frostbomb-dev.log 2>&1 &
SPAWNED=$!
for _ in $(seq 60); do curl -sf --max-time 1 "http://127.0.0.1:$PORT/" >/dev/null && break; sleep 1; done
PID=$(ss -ltnpH "sport = :$PORT" | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
if [ -z "$PID" ] || [ "$(readlink "/proc/$PID/cwd")" != "$ROOT" ]; then
  [ -n "$SPAWNED" ] && kill -- -"$SPAWNED" 2>/dev/null
  echo "FAIL: nothing ready on $PORT, or its owner (pid ${PID:-none}) cwd is not $ROOT"; exit 1
fi
echo "$PID" > /tmp/frostbomb-dev.pid
ps -o pgid= -p "$PID" | tr -d ' ' > /tmp/frostbomb-dev.pgid
echo "launched: pid $PID pgid $(cat /tmp/frostbomb-dev.pgid)"
