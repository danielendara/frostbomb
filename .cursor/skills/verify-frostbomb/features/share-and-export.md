# Share and export

## Sub-features
- Share (file-capable navigators only), Copy link fallback, Save 3D, wallpaper PNG via `W`.

## How to get to it (user POV)
Action bar buttons, or press `W`.

## Driving it with Playwright / curl
Specs: `tests/share-sheet.smoke.spec.ts`, `tests/wallpaper.smoke.spec.ts`, `tests/export-identity.smoke.spec.ts` (stub `navigator.share`/downloads there). Capture the downloaded file and its dimensions.

## Gotchas
Headless Chromium has no native share sheet; the specs stub it. Not driven in the skill's own proof run.
