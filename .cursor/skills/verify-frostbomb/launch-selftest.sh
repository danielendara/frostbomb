#!/usr/bin/env bash
# Foreign listener on 5173: launch must refuse and leave it alive; then launch+doctor+cleanup pass. Needs 5173 free at start.
DIR="$(cd "$(dirname "$0")" && pwd)"
ss -ltnH 'sport = :5173' | grep -q . && { echo "SELFTEST ABORT: 5173 already in use"; exit 2; }
mkdir -p /tmp/frostbomb-foreign && cd /tmp/frostbomb-foreign || exit 2
setsid python3 -m http.server 5173 --bind 127.0.0.1 >/dev/null 2>&1 &
FOREIGN=$!
trap 'kill "$FOREIGN" 2>/dev/null; bash "$DIR/cleanup.sh" >/dev/null 2>&1' EXIT
until curl -sf --max-time 1 http://127.0.0.1:5173/ >/dev/null; do sleep 0.2; done
OUT=$(bash "$DIR/launch.sh"); rc=$?
echo "$OUT"
echo "launch with foreign listener: exit $rc"
[ "$rc" -ne 0 ] || { echo "SELFTEST FAIL: launch exited 0 against a foreign server"; exit 1; }
curl -sf --max-time 2 http://127.0.0.1:5173/ >/dev/null || { echo "SELFTEST FAIL: foreign server no longer answers"; exit 1; }
echo "foreign server still answers"
case "$OUT" in REFUSE*) ;; *) echo "SELFTEST FAIL: launch did not refuse up front (no REFUSE message)"; exit 1;; esac
bash "$DIR/doctor.sh"; rc=$?
echo "doctor with foreign owner: exit $rc"
[ "$rc" -ne 0 ] || { echo "SELFTEST FAIL: doctor passed on a foreign owner"; exit 1; }
kill "$FOREIGN"; wait "$FOREIGN" 2>/dev/null
for _ in $(seq 20); do ss -ltnH 'sport = :5173' | grep -q . || break; sleep 0.2; done
bash "$DIR/launch.sh" && bash "$DIR/doctor.sh" && bash "$DIR/cleanup.sh" || { echo "SELFTEST FAIL: launch/doctor/cleanup after foreign killed"; exit 1; }
echo "SELFTEST PASS"
