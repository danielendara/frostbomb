#!/usr/bin/env bash
# Fails (exit 1) if any png/webm in the proof tree is byte-identical to its copy in the stale bundle.
# usage: proof-identity-check.sh [stale-ref=612c789]   (run from the proof checkout, before committing)
set -uo pipefail
STALE=${1:-612c789}
fail=0; n=0
echo "# proof identity check vs $STALE ($(git rev-parse --short $STALE)), $(date -Is)"
for f in $(ls | grep -E '\.(png|webm)$' | sort); do
  n=$((n+1)); new=$(git hash-object "$f")
  old=$(git rev-parse -q --verify "$STALE:$f" 2>/dev/null || true)
  if [ -z "$old" ]; then echo "NEW        $f"
  elif [ "$new" = "$old" ]; then echo "IDENTICAL  $f  (blob $new)"; fail=1
  else echo "CHANGED    $f"; fi
done
echo "checked $n png/webm files"
[ $fail = 0 ] && echo "RESULT: PASS (no png/webm byte-identical to $STALE)" || echo "RESULT: FAIL (byte-identical files above)"
exit $fail
