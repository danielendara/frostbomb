# AGENTS.md

Frostbomb: Vite + three.js snowflake app on a Cloudflare Worker. Node >= 22.12, npm.

## Commands
- Typecheck app: `npx tsc --noEmit` (`npm run build` = `tsc && vite build`)
- Typecheck tests: `npm run typecheck:tests`
- Unit tests: `npm run test:unit` (vitest, `tests/unit/**`)
- E2E smoke: `npm run test:e2e:smoke`; full chromium suite: `npm run test:e2e:full` (Playwright starts `npm run dev` on 127.0.0.1:5173)
- Lint and coverage: the repo has neither, so there is no gate for them.

## Verify (the gate; CI is local-only)
`npm run verify` (`scripts/verify.sh`) runs, fail-fast: tsc, typecheck:tests, vitest, vite build, e2e smoke. Run it before pushing. Setup once: `npm ci && npx playwright install chromium`.

How to launch and drive the app: `.cursor/skills/verify-frostbomb/SKILL.md`.

## Proof required in PRs
- Verify output (tail with pass/fail counts).
- UI changes: before/after screenshots. Logic changes: test output.
- One mutation proof: revert the fix, show the new test fails, restore.

## Rules
- Never deploy (`npm run deploy`, `wrangler deploy`).
- Never force-push or rebase a pushed branch.
- Never print secrets.
