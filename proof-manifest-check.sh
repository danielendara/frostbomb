#!/usr/bin/env bash
# Checks the proof tree against issue #442's "Proof to attach" list. Run from the proof checkout. Exit 1 on any miss.
miss=0; ok(){ echo "OK    $1"; }; no(){ echo "MISS  $1"; miss=1; }
chk(){ desc="$1"; shift; for f in "$@"; do [ -s "$f" ] || { no "$desc ($f)"; return; }; done; ok "$desc"; }
shots=(); for t in rich lite; do for h in plate sector_plate stellar_dendrite fernlike_dendrite capped_column; do shots+=(before-$t-$h.png after-$t-$h.png); done; done
chk "before/after shots: 5 A0 seeds x {RICH, LITE}" "${shots[@]}"
grep -q "RESULT: PASS" direct-diff.txt 2>/dev/null && ok "per-seed x tier diff gate (direct-diff.txt RESULT: PASS)" || no "per-seed x tier diff gate"
chk "video per tier: RICH animated, LITE static, reduced-motion static" orbit-rich.webm orbit-lite.webm orbit-reduced.webm
chk "perf p95 / fps before->after table, desktop + throttled low-end mobile" perf-table.md
grep -q "desktop" perf-table.md && grep -q "low-end-mobile" perf-table.md && ok "perf table covers both profiles" || no "perf table covers both profiles"
chk "bundle size table (gzip KiB before->after)" bundle-table.md build-before.txt build-after.txt
grep -q "ALL PASSED" verify.txt 2>/dev/null && ok "npm run verify tail (ALL PASSED)" || no "npm run verify tail"
grep -q "(empty output above = PASS)" generator-diff.txt && [ "$(grep -vc '^\$\|^(empty' generator-diff.txt)" = 0 ] && ok "no-generator-diff check prints nothing" || no "no-generator-diff check"
grep -A8 "^## 1\." mutations.txt | grep -q "failed" && ok "mutation proof: reduced-motion glint mutation fails its test" || no "mutation proof (reduced motion)"
grep -q "exit=0" e2e-full.txt && ok "full e2e (exit 0)" || no "full e2e"
H=$(sed -n 's/^PR_HEAD=//p' PROOF-MANIFEST.txt); for f in mutations.txt verify.txt e2e-full.txt generator-diff.txt; do grep -q "${H:0:7}" $f || no "$f names PR_HEAD $H"; done
[ $miss = 0 ] && echo "RESULT: PASS (every item on the issue #442 proof list is present)" || { echo "RESULT: FAIL"; exit 1; }
