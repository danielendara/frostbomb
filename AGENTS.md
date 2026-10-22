# AGENTS.md

Frostbomb: Vite + three.js snowflake app on a Cloudflare Worker. Node >= 22.12, npm.

## Commands
- Typecheck app: `npx tsc --noEmit` (`npm run build` = `tsc && vite build`)
- Typecheck tests: `npm run typecheck:tests`
- Unit tests: `npm run test:unit` (vitest, `tests/unit/**`)
- E2E smoke: `npm run test:e2e:smoke`; full chromium suite: `npm run test:e2e:full` (Playwright starts `npm run dev` on 127.0.0.1:5173)
- Lint and coverage: the repo has neither, so there is no gate for them.

## Verify (the gate; CI is local-only)
`npm run verify` (`scripts/verify.sh`) runs, fail-fast: AGENTS.md policy check, tsc, typecheck:tests, vitest, vite build, three chunk budget, e2e smoke. Run it before pushing. Setup once: `npm ci && npx playwright install chromium`.

How to launch and drive the app: `.cursor/skills/verify-frostbomb/SKILL.md`.

## Modern web platform

**Baseline target:** Baseline widely available (no narrower browser support policy is documented elsewhere in this repo).

**Modern Web Guidance:** Project skill at `.agents/skills/modern-web-guidance/SKILL.md` (installed via `npx skills add GoogleChrome/modern-web-guidance -y --copy -s modern-web-guidance -a cursor`). For HTML, CSS, and client-side JavaScript work, read that skill first. Search vendored guides locally with `rg` under `.agents/skills/modern-web-guidance/guides/` (for example `rg -i "dialog" .agents/skills/modern-web-guidance/guides/`) before implementing UI or platform APIs from memory. Optional CLI fallback only when local search is insufficient: `npx modern-web-guidance@0.0.195 search "<query>"` and `npx modern-web-guidance@0.0.195 retrieve "<id>"` (pin matches `npm view modern-web-guidance version`).

## Proof required in PRs
- Verify output (tail with pass/fail counts).
- UI changes: before/after screenshots. Logic changes: test output.
- One mutation proof: revert the fix, show the new test fails, restore.

## Rules
- Never deploy (`npm run deploy`, `wrangler deploy`).
- Never force-push or rebase a pushed branch.
- Never print secrets.
