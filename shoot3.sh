#!/usr/bin/env bash
# Capture every shot twice; re-capture (all 4 files) any seed x tier that fails a capture gate (DARKER/UNSTABLE), up to 4 attempts.
cd /workspace/fb442-proof; pkill -f "node serve.mjs"; (nohup node serve.mjs before/dist/client 8797 >/dev/null 2>&1 &); (nohup node serve.mjs after2/dist/client 8798 >/dev/null 2>&1 &); sleep 2
cd proof
shoot(){ t=$1; h=$2; s=$3; for x in before:8797 after:8798; do n=${x%%:*}; port=${x#*:}; for sfx in "" -r2; do
  for try in 1 2 3; do node ../look.mjs http://127.0.0.1:$port $s $t $n-$t-$h$sfx.png >/dev/null && break; echo "  look retry $n $t $h$sfx"; done; done; done; }
SEEDS="plate:fox sector_plate:nov stellar_dendrite:charlie fernlike_dendrite:alpha capped_column:whisky"
echo "PASS1 $(date +%T)"; for t in rich lite; do for hs in $SEEDS; do shoot $t ${hs%%:*} ${hs#*:}; done; done
for attempt in 2 3 4; do
  python3 direct-diff.py > /tmp/dd.txt; cat /tmp/dd.txt
  redo=$(python3 direct-diff.py --json | python3 -c 'import json,sys;print(" ".join(r["tier"]+":"+r["habit"] for r in json.load(sys.stdin) if ("DARKER" in r["status"] or "UNSTABLE" in r["status"])))')
  [ -z "$redo" ] && break
  echo "ATTEMPT $attempt reshoot: $redo $(date +%T)"
  for th in $redo; do t=${th%%:*}; h=${th#*:}; s=$(for hs in $SEEDS; do [ ${hs%%:*} = $h ] && echo ${hs#*:}; done); shoot $t $h $s; done
done
python3 direct-diff.py | tee direct-diff.txt; echo "SHOOTDONE $(date +%T)"
