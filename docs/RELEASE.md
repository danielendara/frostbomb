# Release checklist

Use this checklist when deploying frostbomb to Cloudflare Workers. The live site is https://frostbomb.com.

The package `deploy` script is `npm run build && wrangler deploy`. The README documents `npm run deploy`, which runs that same script.

## Before deploy

- [ ] **Build:** `npm run build` — `tsc && vite build`
- [ ] **Unit:** `npm run test:unit`
- [ ] **E2E:** `npm test` — Playwright; `pretest` also runs unit tests
- [ ] Confirm this release does not accidentally change the Worker deploy path (`wrangler.jsonc` name `frostbombsite`, SPA asset fallback, `package.json` `deploy` script)

## Deploy

```bash
npm run build && wrangler deploy
```

Equivalent:

```bash
npm run deploy
```

Wrangler uploads the Vite `dist/` output as Worker static assets, including `dist/_headers` copied from `public/_headers`. Do not skip the build.

Local Worker preview (same build, no production publish):

```bash
npm run preview
# npm run build && wrangler dev
```

## Live checks

After the Worker is live at https://frostbomb.com:

1. **Headers / CSP** — `curl -sI https://frostbomb.com/` should include `Content-Security-Policy` from `public/_headers` (also `X-Content-Type-Options: nosniff`).
2. **postprocessing is not modulepreloaded** — fetch the live HTML and confirm there is no `<link rel="modulepreload"` whose href contains `postprocessing`. `vite.config.ts` filters those deps in `build.modulePreload.resolveDependencies` so first paint stays on the lightweight pipeline.
3. **Smoke** — open the site, confirm a crystal renders, and that Lab Mode / export still work.

## Rollback

Cloudflare Workers keep prior deployments. In the dashboard (Workers & Pages → `frostbombsite` → Deployments), roll back to the last known-good version.

Alternatively redeploy a previous git SHA:

```bash
git checkout <known-good-sha>
npm run build && wrangler deploy
```

That restores the previous asset bundle, including `_headers` CSP.
