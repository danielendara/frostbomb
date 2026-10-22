# Performance audit

The April 2026 Lighthouse audit below is **superseded** for lab scoring. Use the Oct 2026 mobile lab baseline instead: Performance **57**, LCP **3.3 s**, TBT **2.8 s** (throttled mobile). Ongoing guidance: `docs/performance/rendering-baseline.md`, custom marks in `src/snowflake/perf-marks.ts`, and the backlog item “Measure first-load experience on real devices.”

---

## Archived: April 2026 snapshot (historical)

Date: 2026-04-26  
Target: `https://frostbomb.com/`  
Tooling: Lighthouse 13.1.0 plus live browser/resource inspection

### Summary

The live site was healthy from a network and server perspective. The HTML response was fast, static assets were cacheable, and total transferred bytes were modest for a Three.js experience.

The main performance risk was client-side rendering work: the app is intentionally WebGL/canvas-heavy, so startup cost was dominated by Three.js initialization, snowflake geometry setup, and first-frame rendering. Lighthouse could not compute a normal Performance score because it did not detect an LCP candidate for this canvas-first page.

### Lighthouse results (April 2026)

Lighthouse category scores:

| Category | Score |
|---|---:|
| Accessibility | 100 |
| Best Practices | 81 |
| SEO | 91 |
| Performance | Not scored |

Key metrics:

| Metric | Result |
|---|---:|
| Initial server response | 61 ms |
| First Contentful Paint | 3.7 s |
| Speed Index | 5.9 s |
| Cumulative Layout Shift | 0 |
| Total transferred bytes | 352 KiB |

Lighthouse reported `NO_LCP`, so LCP, TBT, and TTI were not available. That is common for pages whose primary experience is a canvas and whose visible content does not behave like a normal document/image hero.

### Network findings (April 2026)

Largest transferred resources:

| Resource | Transfer |
|---|---:|
| `three-*.js` | 136 KiB |
| postprocessing dynamic chunk | 72 KiB |
| Cormorant Garamond font | 39 KiB |
| Cormorant Garamond font | 38 KiB |
| JetBrains Mono font | 31 KiB |
| Cloudflare beacon | 11 KiB |
| Cloudflare challenge script | 11 KiB |
| app entry chunk | 9 KiB |

### Main-thread findings (April 2026)

| Area | Result |
|---|---:|
| Main-thread work | 13.6 s |
| Script evaluation | 12.9 s |
| App entry script bootup | 7.8 s |
| Cloudflare challenge script bootup | 5.1 s |

These numbers were from Lighthouse's throttled environment and should be treated as directional rather than exact.

### Recommendations (still relevant)

- **Field data:** Cloudflare Web Analytics or similar RUM plus trending the existing marks on real devices.
- **Postprocessing after deploys:** confirm initial HTML does not `modulepreload` the postprocessing chunk (`docs/RELEASE.md`).

### Done

- **Custom first-flake-ready marks** — `src/snowflake/perf-marks.ts` (`frostbomb:first-flake-built`, `frostbomb:first-frame-rendered`, `frostbomb:postprocessing-ready`); smoke coverage in `tests/canvas-marks.smoke.spec.ts`.
- **Canvas smoke/performance checks in CI** — `tests/canvas-marks.smoke.spec.ts` (smoke project) checks a nonblank canvas and that the custom performance marks fire.
- **Self-hosted fonts** — fonts under `public/fonts/` (`tests/unit/self-hosted-fonts.spec.ts`, `tests/self-hosted-fonts.spec.ts`). Optional follow-up: subset or drop unused weights to shrink initial transfer.
