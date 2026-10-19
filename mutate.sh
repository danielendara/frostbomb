#!/usr/bin/env bash
# usage: mutate.sh  (run from repo root, clean tree at the PR head)
F=src/snowflake/segment-geometry.ts
OUT=/tmp/fb441v2/proof/mutations.txt
HEAD=$(git rev-parse HEAD)
: > $OUT
log(){ echo "$@" | tee -a $OUT; }
run(){ npx vitest run tests/unit 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(×|✗|FAIL)| FAIL |Test Files|Tests  " | sed 's/ ([0-9]*ms)//' | tee -a $OUT; }
log "# Mutation runs on HEAD=$HEAD  ($(date -Is))"
log "# each: apply with sed, show diff, run 'npx vitest run tests/unit', restore with 'git checkout -- $F', confirm clean"
mut(){ name="$1"; expr="$2"
  log ""; log "## $name"; log "\$ sed -i '$expr' $F"
  sed -i "$expr" $F
  git diff -U0 -- $F | tail -n +5 | tee -a $OUT
  [ -z "$(git diff -- $F)" ] && { log "MUTATION DID NOT APPLY"; return; }
  log "\$ npx vitest run tests/unit"; run
  git checkout -- $F; log "restored: git status --porcelain -> '$(git status --porcelain)'"
}
mut "1. face removal (drop the far end cap)" 's/for (const end of \[rings\[0\], rings\[rings.length - 1\]\])/for (const end of [rings[0]])/'
mut "2. core rotation (CORE_EULER_ORDER back to three's default XYZ)" 's/export const CORE_EULER_ORDER: THREE.EulerOrder = "ZXY";/export const CORE_EULER_ORDER: THREE.EulerOrder = "XYZ";/'
mut "3. segment not flat (SEGMENT_SPEC ridge/shoulder 0.2/0.05 -> 0.5/0.5)" '/^const SEGMENT_SPEC/,/^};/{s/  ridge: 0.2,/  ridge: 0.5,/;s/  shoulder: 0.05,/  shoulder: 0.5,/}'
mut "4. winding flip disabled (buildPrism no longer reverses inward faces)" 's/    if (n.dot(centre) < 0) {/    if (false \&\& n.dot(centre) < 0) {/'
log ""; log "## restored tip"; log "\$ npx vitest run tests/unit"; run
