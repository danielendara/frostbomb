# Performance audit

Date: 2026-04-26
Target: `https://frostbomb.com/`
Tooling: Lighthouse 13.1.0 plus live browser/resource inspection

## Summary

The live site is healthy from a network and server perspective. The HTML response is fast, static assets are cacheable, and total transferred bytes are modest for a Three.js experience.

The main performance risk is client-side rendering work: the app is intentionally WebGL/canvas-heavy, so startup cost is dominated by Three.js initialization, snowflake geometry setup, and first-frame rendering. Lighthouse could not compute a normal Performance score because it did not detect an LCP candidate for this canvas-first page.

## Lighthouse results

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

## Network findings

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

Good signs:

- Static assets are immutable and long-cacheable.
- Total payload is reasonable for a 3D visual app.
- CLS is `0`, so layout is stable.
- The document response is fast.

Watch-outs:

- Font files are a meaningful part of the initial payload.
- Cloudflare-injected scripts add work and bytes outside the app bundle.
- The postprocessing chunk is deferred by app logic, but still needs live verification after each deploy because Vite preload behavior can change with chunking.

## Main-thread findings

Lighthouse attributed most startup work to script execution:

| Area | Result |
|---|---:|
| Main-thread work | 13.6 s |
| Script evaluation | 12.9 s |
| App entry script bootup | 7.8 s |
| Cloudflare challenge script bootup | 5.1 s |

These numbers are from Lighthouse's throttled environment and should be treated as directional rather than exact. The important signal is that startup cost is CPU-bound more than network-bound.

## Recommendations

### P1: Add a real user monitoring baseline

Use Cloudflare Web Analytics or another lightweight RUM source to collect real FCP/LCP-ish field signals. Lab tools struggle with canvas-first pages, so real-device data matters here.

Done means: we can answer whether mobile users are seeing a fast first render without manually running Lighthouse.

### P1: Add a custom first-flake-ready mark

Status: completed on 2026-06-07.

Instrument the app with `performance.mark()` when the first snowflake is generated and when the first render finishes. This gives us a project-specific metric that Lighthouse cannot infer from canvas content.

Suggested marks:

- `frostbomb:first-flake-built`
- `frostbomb:first-frame-rendered`
- `frostbomb:postprocessing-ready`

Done means: Playwright or browser DevTools can report app-specific startup timing.

### P2: Re-check postprocessing after deploys

The intended behavior is: render first with the lightweight pipeline, then load postprocessing afterward for polish. Keep checking production HTML and network traces to ensure `postprocessing` is not preloaded on initial HTML.

Done means: initial HTML does not include a `modulepreload` for the postprocessing chunk.

### P2: Evaluate font strategy

The typography looks good, but the fonts are a noticeable part of initial transfer. Options:

- keep as-is if the visual identity matters most,
- self-host and subset the fonts,
- reduce font weights/styles,
- use `font-display: swap` if not already present from Google Fonts CSS.

Done means: either record the current font cost as acceptable or reduce initial font transfer.

### P2: Add canvas smoke/performance checks in CI

Add a Playwright test that verifies the canvas is nonblank and records custom startup marks. This catches blank WebGL regressions and gives us a local trend line.

Done means: CI fails if the canvas does not render or if app-specific startup marks never fire.

## Current priority

The best next performance improvement is instrumentation, not another optimization pass. We need a metric that fits the app: "time until the first snowflake is visibly rendered." Once that exists, the next optimization target will be obvious instead of guessed.
