# frostbomb backlog

Lightweight project backlog for upcoming improvements. Keep items small enough to finish in a focused session, and move completed work into release notes or commit history instead of letting this file become a museum.

## Next

### Add production monitoring
- Goal: catch live runtime errors and deploy regressions quickly.
- Ideas: Cloudflare Web Analytics, Worker logs, browser error reporting, uptime check.
- Done means: live errors and traffic health are visible without opening DevTools.

### Configure canonical domain behavior
- Goal: make `www.frostbomb.com` and `frostbomb.com` resolve to one canonical URL.
- Note: this is deployed on Cloudflare Workers, so use a Cloudflare redirect rule or Worker route rather than a Pages-style `_redirects` file.
- Done means: `https://www.frostbomb.com/...` redirects to `https://frostbomb.com/...` with path and query preserved.

### Improve share previews
- Goal: make shared links look polished in messages and social previews.
- Ideas: Open Graph tags, Twitter card tags, canonical URL, preview image.
- Done means: sharing `https://frostbomb.com/?seed=abc12` shows a useful title, description, and image.

### Add install/run documentation for Workers
- Goal: keep README aligned with the actual Cloudflare Workers deployment.
- Ideas: document `npm run dev`, `npm run build`, `npm test`, `npm run deploy`, Node version, and Worker-specific redirect caveat.
- Done means: a new contributor can run, test, and deploy without guessing.

## Performance

### Measure first-load experience on real devices
- Goal: understand whether the Three.js and postprocessing chunks are acceptable on mobile.
- Ideas: Lighthouse, WebPageTest, Chrome Performance panel, reduced-motion comparison.
- Done means: baseline metrics are recorded for desktop and mobile, with one or two concrete follow-up tasks.

### Tune postprocessing loading
- Goal: preserve the visual polish while minimizing startup cost.
- Ideas: load bloom only after first interaction, disable postprocessing on low-power devices, compare before/after screenshots.
- Done means: first render stays fast and the visual difference is intentional.

### Add canvas smoke checks
- Goal: prevent blank WebGL regressions.
- Ideas: Playwright screenshot or pixel checks on desktop and mobile viewport sizes.
- Done means: CI fails if the canvas renders blank or the primary UI overlaps badly.

## Product polish

### Improve copy/share feedback
- Goal: make Copy Link reliable and clear.
- Ideas: handle clipboard failures, fallback to selecting URL, add accessible status text.
- Done means: denied clipboard permissions do not fail silently.

### Add seed persistence affordances
- Goal: make favorite flakes easier to revisit.
- Ideas: recent seeds list, copy seed only, random seed input in Lab Mode.
- Done means: users can intentionally return to a previous flake without hunting browser history.

### Refine mobile layout
- Goal: make the controls feel as intentional on small screens as they do on desktop.
- Ideas: test narrow devices, reduce footer crowding, tune field guide height.
- Done means: core controls are comfortable at 360px width with no overlap.

## Engineering

### Consider Bun locally
- Goal: decide whether Bun is useful without committing to churn.
- Ideas: try `bun install`, `bun run dev`, `bun run build`, and `bun test` compatibility.
- Done means: either document "npm remains canonical" or open a migration task with measured benefits.

### Add dependency update cadence
- Goal: keep Vite, Three.js, Wrangler, and Playwright current without surprise breakage.
- Ideas: Dependabot or Renovate, monthly update pass, CI verification.
- Done means: dependency updates are routine and tested.

### Add release checklist
- Goal: make deploys predictable.
- Ideas: build, test, deploy, live header check, live smoke check, rollback note.
- Done means: a short checklist exists and matches the Worker deploy flow.
