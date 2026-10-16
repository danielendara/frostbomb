# URL state

## Sub-features
- `?seed=` and Lab coordinates round-trip; Back/Forward restore geometry.

## How to get to it (user POV)
Edit the seed, move Lab points, use Back/Forward.

## Driving it with Playwright / curl
Spec: `tests/crystal-provenance.smoke.spec.ts`. Compare `page.url()` before/after reload.

## Gotchas
URL writes are coalesced/throttled; wait briefly before reading `page.url()`.
