# Release checklist

Use this checklist when deploying frostbomb to Cloudflare Workers. The live site is https://frostbomb.com.

The package `deploy` script is `npm run build && wrangler deploy`. The README documents `npm run deploy`, which runs that same script.

## Before deploy

- [ ] **Build:** `npm run build` — `tsc && vite build`
- [ ] **Unit:** `npm run test:unit`
- [ ] **E2E (smoke):** `npm run test:e2e:smoke` — default Playwright coverage (same as CI smoke). `npm test` also ends in smoke-only e2e via `--project=sequential-smoke`; `pretest` runs unit tests first.
- [ ] **E2E (full, before risky UI/canvas/test changes):** `npm run test:e2e:full`, or add the `full-e2e` label on the PR so CI runs the full chromium suite (see `.github/workflows/ci.yml`).
- [ ] Confirm this release does not accidentally change the Worker deploy path (`wrangler.jsonc` name `frostbombsite`, `main` = `src/worker/index.ts`, SPA asset fallback, `run_worker_first` limited to `/api/*`, `package.json` `deploy` script)
- [ ] **Database:** frostbomb has no D1/KV/R2 bindings today. If a future change adds persisted state or migrations, apply and verify those migrations on production **before** merging to `main`.

## Deploy

```bash
npm run build && npx wrangler deploy
```

Equivalent:

```bash
npm run deploy
```

The Cloudflare Vite plugin builds the static site to `dist/client/` (including `dist/client/_headers` copied from `public/_headers`) and the Worker script to `dist/frostbombsite/`, then points `wrangler deploy` at the generated config (`.wrangler/deploy/config.json`). Do not skip the build.

Local Worker preview (same build, no production publish):

```bash
npm run preview
# npm run build && wrangler dev
```

## Live checks

After the Worker is live at https://frostbomb.com:

1. **Headers / CSP** — `curl -sI https://frostbomb.com/` should include `Content-Security-Policy` from `public/_headers` (also `X-Content-Type-Options: nosniff`).
   Then load the site and confirm the browser console shows no CSP violations (this covers the Cloudflare Web Analytics beacon and the edge bot-check script; `script-src` includes `'unsafe-inline'` for that injected check).
2. **postprocessing is not modulepreloaded** — fetch the live HTML and confirm there is no `<link rel="modulepreload"` whose href contains `postprocessing`. `vite.config.ts` filters those deps in `build.modulePreload.resolveDependencies` so first paint stays on the lightweight pipeline.
3. **Smoke** — open the site, confirm a crystal renders, and that Lab Mode / export still work.
4. **Client-error endpoint** — `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://frostbomb.com/api/client-error -H 'content-type: application/json' -d '{"kind":"error","message":"release check","build":"release-check","ua":"other"}'` should print `204`, and the line should show up in Workers Logs (below).

## Client errors in Workers Logs

Browser failures are reported to `POST /api/client-error`, and the Worker writes each one as a single `console.error` JSON line with `"event":"client_error"`. The Worker only runs for `/api/*` (`assets.run_worker_first`); every other request is served straight from static assets.

To view them: Cloudflare dashboard → Workers & Pages → `frostbombsite` → **Observability** → **Logs** (Workers Logs, enabled by `observability.enabled` in `wrangler.jsonc`). Filter on `event = client_error`, then group by `kind` or `build`. For a live tail, use `npx wrangler tail frostbombsite --format pretty`.

Each report is a fixed allowlist, and the Worker rejects anything else with `400`/`413`. Non-`POST` requests get `405`, and cross-site posts (a `Sec-Fetch-Site` other than `same-origin`, or an `Origin` that differs from the request origin) get `403`. Requests with neither header, like the `curl` check above, are accepted:

| Field | Meaning |
| --- | --- |
| `kind` | `error`, `unhandledrejection`, `webgl-context-lost`, `frost-worker`, `chunk-reload`, `chunk-load`, `postprocessing`, `export` |
| `message` | Error message, ≤300 chars, URL query strings and fragments stripped |
| `source`, `line`, `col` | Same-origin script path (no query) and position, or `external` |
| `build` | Hashed main bundle name, e.g. `index-61FAqeWf`: tells you which deploy a report came from |
| `ua` | Coarse browser family: `chrome`, `edge`, `firefox`, `safari`, `other` |

Reports never include seeds, full URLs, IPs, or other identifiers. The client dedupes identical reports and sends at most 5 per page load. No storage bindings and no third-party error service are used.

## Rollback

Cloudflare Workers keep prior deployments. Prefer rolling back to a known-good **version ID** (never run `wrangler rollback` without an ID):

```bash
npx wrangler deployments list --name frostbombsite
npx wrangler rollback <version-id> --name frostbombsite -m "reason"
```

In the dashboard: Workers & Pages → `frostbombsite` → Deployments → choose a prior deployment → Rollback.

Alternatively redeploy a previous git SHA:

```bash
git checkout <known-good-sha>
npm run build && npx wrangler deploy
```

That restores the previous asset bundle, including `_headers` CSP. See also `docs/RECOVERY.md`.
