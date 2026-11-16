# AGENTS.md

Frostbomb: a Vite + three.js snowflake app served by a Cloudflare Worker (`src/worker/`, `wrangler.jsonc`). Node >= 22.12, npm. No database, no auth, no bindings other than static assets; all state lives in the URL and `localStorage`.

## Rules
- Never deploy (`npm run deploy`, `wrangler deploy`, `wrangler rollback`). Release and rollback steps are in `docs/RELEASE.md` and `docs/RECOVERY.md`, for the maintainer.
- Never force-push or rebase a pushed branch.
- Never print secrets.
- This repository is public. Keep security findings, account or resource IDs and anything about other projects out of commits, PRs, issues and comments; report them to the maintainer privately.
- Do not loosen a guard to get green: the CSP (`src/worker/csp.ts` and `public/_headers`, kept identical by `tests/unit/csp.spec.ts`), HSTS, `.gitleaksignore`, coverage thresholds, or the chunk budget.

## Verify (the local gate; a superset of GitHub Actions CI)
`npm run verify` (`scripts/verify.sh`) runs, fail-fast: AGENTS.md policy check, docs hygiene, `tsc --noEmit`, typecheck:tests, lint, test:coverage, vite build, three chunk budget, then e2e smoke or the full suite (`scripts/e2e-mode.sh --local` picks full when the diff vs `origin/main` touches rendering/UI/test paths, and also when the diff is empty). Run it before pushing. Setup once: `npm ci && npx playwright install chromium`.

CI (`.github/workflows/ci.yml`) runs on push to `main` and on PRs: build, AGENTS.md policy, chunk budget, typecheck:tests, unit tests, then Playwright smoke or a 4-shard full run. It does not run lint, docs hygiene or coverage; only `verify` does.

How to launch and drive the app: `.cursor/skills/verify-frostbomb/SKILL.md`.

## Commands
- Typecheck app: `npx tsc --noEmit` (`npm run build` = `tsc && vite build`); tests: `npm run typecheck:tests`
- Unit tests: `npm run test:unit` (vitest, `tests/unit/**`); with v8 coverage thresholds: `npm run test:coverage`
- E2E smoke: `npm run test:e2e:smoke`; full chromium suite: `npm run test:e2e:full` (Playwright starts `npm run dev` on 127.0.0.1:5173)
- Lint: `npm run lint`

## Purpose and proof (required)

Every agent-filed issue and every PR must start with the Purpose block from the `.github` templates. Apply labels `priority:P1` | `priority:P2` | `priority:P3` and `value:high` | `value:medium` | `value:low`. A missing or vague Purpose block is a Gabriel HOLD. Dependabot and one-line chores are exempt.

PR proof: the verify tail with pass/fail counts; for UI changes, before/after screenshots; for logic changes, test output; and one mutation proof (revert the fix, show the new test fails, restore).

## Modern web platform

**Baseline target:** Baseline widely available (no narrower browser support policy is documented elsewhere in this repo).

**Modern Web Guidance:** for HTML, CSS and client-side JavaScript work, read `.agents/skills/modern-web-guidance/SKILL.md` first and search the vendored guides with `rg` under `.agents/skills/modern-web-guidance/guides/` (for example `rg -i "dialog" .agents/skills/modern-web-guidance/guides/`) before implementing UI or platform APIs from memory. The only CLI fallback is the pinned `npx modern-web-guidance@1.0.0 search "<query>"` / `retrieve "<id>"`; never an unpinned package or a floating dist-tag.

## Gotchas
- `git push` runs a pre-push hook (lint, both typechecks, unit tests), so a worktree needs `npm ci` before its first push. The hook does not run `verify`.
- The three.js chunk is within a few hundred bytes of its raw budget (`scripts/three-chunk-budget.json`). A three.js bump or a new import from `three` can fail the build step; that is the budget working, so raise it on purpose in the same PR and say why.
- Only `*.smoke.spec.ts` run in the smoke project. A new non-smoke spec runs only in the full suite (`npm run test:e2e:full`, or the `full-e2e` PR label in CI).
- A full local e2e run takes about five and a half minutes. `export-identity.smoke.spec.ts` can time out under load; rerun before treating it as a regression.
- `scripts/check-docs-hygiene.mjs` fails `verify` on a few machine-specific phrases anywhere under `docs/`; read its pattern before writing there.
- The helper scripts in `.cursor/skills/verify-frostbomb/` use `setsid`, `ss` and `/proc`, so they run on Linux only.
- `docs/RELEASE.md` is checked by `tests/unit/release-docs.spec.ts`; a change to the deploy flow, the CSP wording or the Worker's routing needs both updated.
