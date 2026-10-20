#!/usr/bin/env bash
# Identity check for the #442 proof tree, modeled on proof-identity-check.sh from proof/frostbomb-441.
# usage: proof-identity-check.sh [prev-proof=29889e9]   (run from the proof checkout, before committing)
#
# 1. Byte identity: no png/webm may be byte-identical to its namesake in the previous proof commit.
#    (Particles are random per load, so even an unchanged render is never byte-identical: a byte
#    match would mean a stale file copied across.)
# 2. Pixel identity, on the flake only (pixels where the previous proof's after shot is lit):
#    - this proof's before-<tier>-X must MATCH the previous proof's after-<tier>-X: both are the
#      A2 main state (#441), so only snow differs. PASS when <= $MATCH_MAX % of flake pixels differ.
#    - this proof's after-<tier>-X must NOT match it: glints and the retuned frost tiling changed
#      the render. PASS when >= $CHANGE_MIN % of flake pixels differ.
set -uo pipefail
PREV=${1:-29889e9}
MATCH_MAX=${MATCH_MAX:-0.5}
CHANGE_MIN=${CHANGE_MIN:-1.5}
fail=0; n=0
echo "# proof identity check vs $PREV ($(git rev-parse --short "$PREV")), $(date -Is)"
echo "## 1. byte identity"
for f in $(ls | grep -E '\.(png|webm)$' | sort); do
  n=$((n+1)); new=$(git hash-object "$f")
  old=$(git rev-parse -q --verify "$PREV:$f" 2>/dev/null || true)
  if [ -z "$old" ]; then echo "NEW        $f"
  elif [ "$new" = "$old" ]; then echo "IDENTICAL  $f  (blob $new)"; fail=1
  else echo "CHANGED    $f"; fi
done
echo "checked $n png/webm files"
echo "## 2. pixel comparison on the flake (threshold: a channel differs by more than 10)"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for tier in rich lite; do for habit in plate sector_plate stellar_dendrite fernlike_dendrite capped_column; do
  git show "$PREV:after-$tier-$habit.png" > "$tmp/prev-after-$tier-$habit.png" 2>/dev/null || { echo "MISSING    $PREV:after-$tier-$habit.png"; fail=1; }
done; done
python3 -I - "$tmp" "$MATCH_MAX" "$CHANGE_MIN" <<'PY' || fail=1
import sys, numpy as np
from PIL import Image
tmp, match_max, change_min = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
bad = 0
for tier in ("rich", "lite"):
    for habit in ("plate", "sector_plate", "stellar_dendrite", "fernlike_dendrite", "capped_column"):
        prev = np.asarray(Image.open(f"{tmp}/prev-after-{tier}-{habit}.png").convert("RGB")).astype(int)
        before = np.asarray(Image.open(f"before-{tier}-{habit}.png").convert("RGB")).astype(int)
        after = np.asarray(Image.open(f"after-{tier}-{habit}.png").convert("RGB")).astype(int)
        luma = 0.2126 * prev[..., 0] + 0.7152 * prev[..., 1] + 0.0722 * prev[..., 2]
        flake = luma > 70  # the lit surface is ~147; the background and snow-free sky are < 40
        # UI text (left) and the action rail (right) also sit above the dark sky: keep the canvas centre.
        h, w = flake.shape
        flake[:, : int(w * 0.28)] = False
        flake[:, int(w * 0.78):] = False
        flake[int(h * 0.88):, :] = False
        n = int(flake.sum())
        def diff(a, b):
            return 100.0 * float(((np.abs(a - b).max(axis=2) > 10) & flake).sum()) / max(n, 1)
        d_before, d_after = diff(before, prev), diff(after, prev)
        ok_b, ok_a = d_before <= match_max, d_after >= change_min
        bad += (not ok_b) + (not ok_a)
        print(f"{'MATCH   ' if ok_b else 'MISMATCH'} before-{tier}-{habit} vs prev after: {d_before:6.3f}% of {n} flake px differ (want <= {match_max})")
        print(f"{'CHANGED ' if ok_a else 'SAME    '} after-{tier}-{habit}  vs prev after: {d_after:6.3f}% of {n} flake px differ (want >= {change_min})")
sys.exit(1 if bad else 0)
PY
[ $fail = 0 ] && echo "RESULT: PASS (no png/webm byte-identical to $PREV; before shots match the previous after shots; after shots do not)" || echo "RESULT: FAIL (see above)"
exit $fail
