# frostbomb recovery runbook

This is the recovery runbook for frostbomb: how to roll back a bad deploy and confirm the site is healthy. Last verified 2026-09-30 (read-only). Anything not seen directly is marked **UNVERIFIED**. All RTOs are **estimates**.

**Cross-repo overview**
- Bar: outages on live sites are unacceptable, and recovery must take minutes, ideally seconds.
- If a deploy or merge happened in the last ~30 min and the site breaks, **roll back code first**, investigate after.
- Never run a bare `wrangler rollback`: without a version ID it can pick a PR preview version. Always pass an explicit version ID from `npx wrangler versions list` or `npx wrangler deployments list`.
- Cloudflare deploys are done from a maintainer machine.
- **Before merging** any release that adds database migrations (not applicable to frostbomb today), apply and verify those migrations on production first. frostbomb has **no D1, KV, R2, or other bindings** in `wrangler.jsonc`.

---

## frostbomb: static site + tiny Worker

- **Hosting:** Cloudflare Worker `frostbombsite` with static assets (SPA fallback). The Worker only handles `/api/client-error`. **No D1, KV, R2 or other bindings** (verified in `wrangler.jsonc`). Live at `frostbomb.com`.
- **Deploy path:** Workers Builds auto-deploys `main` on merge to GitHub `main` (**UNVERIFIED:** exact build/version IDs change every deploy; list them with wrangler before rollback).
- **Rollback (RTO est. 30-60 s CLI, 1-2 min dashboard):**
```bash
npx wrangler deployments list --name frostbombsite
npx wrangler rollback <version-id> --name frostbombsite -m "reason"
```
Replace `<version-id>` with a **version ID** (not a deployment ID) from `npx wrangler versions list` or `npx wrangler deployments list --name frostbombsite` (never omit it). Docs: https://developers.cloudflare.com/workers/wrangler/commands/workers/#rollback · Dashboard: Workers & Pages → frostbombsite → Deployments → ⋯ → Rollback ([docs](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/)). Also documented in `docs/RELEASE.md` (dashboard, CLI rollback above, or redeploy a previous SHA with `npm run build && npx wrangler deploy`).
- **DB:** none. **Backups:** git only (no server data).
- **Health check:** `curl -sI https://frostbomb.com/ | head -1` → `200`. Then open the page and confirm today's crystal renders.

### Known gaps (est.)

| Current RTO | Gap | Fix |
|---|---|---|
| 30-60 s from a maintainer machine | No post-deploy smoke. | Add the site to a scheduled smoke check |