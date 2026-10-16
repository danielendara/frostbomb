# Client error endpoint

## Sub-features
- `POST /api/client-error` logs a structured event.

## How to get to it (user POV)
Triggered by the app on client errors; curl it directly.

## Driving it with Playwright / curl
See the curl in SKILL.md; spec: `tests/worker-assets.smoke.spec.ts`. Evidence: status code and body; dev log shows a `client_error` JSON line.

## Gotchas
Served by the Cloudflare vite plugin in dev; verify GET of an unknown path returns the SPA shell.
