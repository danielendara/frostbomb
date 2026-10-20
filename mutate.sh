#!/usr/bin/env bash
# usage: mutate.sh  (run from the repo root, clean tracked tree, at the PR head). Output: $OUT
OUT=${OUT:-/tmp/fb442/mutations.txt}
HEAD=$(git rev-parse HEAD)
: > "$OUT"
log(){ echo "$@" | tee -a "$OUT"; }
run(){ npx vitest run "$@" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(×|✗)| FAIL |Test Files|Tests  " | sed 's/ [0-9]*ms$//' | sort -u | tee -a "$OUT"; }
log "# Mutation runs on HEAD=$HEAD ($(date -Is))"
log "# each: apply with sed, show the diff, run vitest, restore with git checkout, confirm clean"
mut(){ file="$1"; name="$2"; expr="$3"; shift 3
  log ""; log "## $name"; log "\$ sed -i '$expr' $file"
  sed -i "$expr" "$file"
  [ -z "$(git diff -- "$file")" ] && { log "MUTATION DID NOT APPLY"; return; }
  git diff -U0 -- "$file" | tail -n +5 | tee -a "$OUT"
  log "\$ npx vitest run $*"; run "$@"
  git checkout -q -- "$file"; log "restored: git status --porcelain (tracked) -> '$(git status --porcelain | grep -v '^??')'"
}
G=src/snowflake/glint.ts; S=src/snowflake/scene.ts
mut $G "1. glint update runs under reduced motion (configure ignores prefersReducedMotion)" 's/const next: GlintMode = tier === "rich" \&\& !prefersReducedMotion ? "view" : "static";/const next: GlintMode = tier === "rich" ? "view" : "static";/' tests/unit/glint.spec.ts
mut $G "2. LITE incurs per-frame glint work (update no longer gated on the view mode)" 's/    if (!this.active) return false;/    if (false) return false;/' tests/unit/glint.spec.ts
mut $S "3. LITE incurs per-frame glint work in the frame loop (scene calls the update unconditionally)" 's/    if (glint.active) {/    if (true) {/' tests/unit/scene-glint.spec.ts
mut $G "4. LITE static glint grows a texture fetch (extra sampler on LITE)" 's/smoothstep( \${GLINT_SHADER_CONSTANTS.staticFrom.toFixed(3)}, \${GLINT_SHADER_CONSTANTS.staticTo.toFixed(3)}, texelRoughness.r )/smoothstep( ${GLINT_SHADER_CONSTANTS.staticFrom.toFixed(3)}, ${GLINT_SHADER_CONSTANTS.staticTo.toFixed(3)}, texture2D( roughnessMap, vRoughnessMapUv ).r )/' tests/unit/glint.spec.ts
mut src/snowflake/frost-data.ts "5. frost tiling back to the old (6, 10) repeat" 's/export const FROST_REPEAT: readonly \[number, number\] = \[0.5, 3\];/export const FROST_REPEAT: readonly [number, number] = [6, 10];/' tests/unit/frost.spec.ts
log ""; log "## restored head"; log "\$ npx vitest run tests/unit/glint.spec.ts tests/unit/scene-glint.spec.ts tests/unit/frost.spec.ts"; run tests/unit/glint.spec.ts tests/unit/scene-glint.spec.ts tests/unit/frost.spec.ts
