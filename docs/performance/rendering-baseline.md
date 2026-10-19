# Rendering baseline (A0)

Repeatable perf and fixed-seed screenshot baseline for the rendering slices (A4, A1, A2, A3, A5). Tooling only: no `src/` change. The scripts run locally, not in CI.

## How to measure

```bash
npm run preview          # production build via wrangler dev, http://127.0.0.1:8787
node scripts/perf-orbit.mjs --profile=desktop --quality=rich
node scripts/perf-orbit.mjs --profile=low-end-mobile --quality=rich
node scripts/shots.mjs --label=<before|after|...>   # -> docs/pr-shots/rendering/<label>/
```

- `perf-orbit.mjs` loads `?seed=fox&rotate=0`, waits for `canvas[data-entry-active="false"]`, then drags a 10 s scripted orbit. It prints JSON (3 runs, median) and a markdown row, including the URL it hit, the `WEBGL_debug_renderer_info` UNMASKED_RENDERER, the Chrome version and headless/headed. Flags: `--profile`, `--seed`, `--quality`, `--runs`, `--url`, `--headed`.
  - **desktop**: no throttle, 1440×900, DPR 2.
  - **low-end-mobile**: CDP `Emulation.setCPUThrottlingRate` 6, 360×640, DPR 2, touch.
- `--quality=rich|lite` is passed as `?quality=`. **It is a no-op until A4 lands.**
- `shots.mjs` captures five seeds, one per habit, with `?rotate=0`, the default camera, after the entry tween settles (`data-entry-active="false"` plus two RAFs). It writes one PNG per seed plus `grid.png`. Background particles are random per load, so compare by eye (the flake matches); there is no pixel-diff threshold.

| habit | seed |
|---|---|
| plate | `fox` |
| sector_plate | `nov` |
| stellar_dendrite | `charlie` |
| fernlike_dendrite | `alpha` |
| capped_column | `whisky` |

(`needle` and plain `column` are not required.)

**Caveats.** Chrome's 6× throttle slows the page's main thread, not the GPU process. Headless Chromium usually renders WebGL with SwiftShader; on that, or any software renderer, the absolute fps budgets below do not apply. The gate is then relative: after p95 ≤ before p95 × 1.10, on the same box, same renderer string, same session. Absolute budgets apply only on a hardware GPU.

## Budgets every later slice is gated on

| metric | budget |
|---|---|
| Desktop RICH | ≥ 60 fps, p95 ≤ 20 ms |
| Low-end mobile LITE | ≥ 30 fps, p95 ≤ 33 ms (RICH on low-end is recorded for information) |
| `frostbomb:first-frame-rendered` | ≤ baseline + 10% |
| RICH initial JS | ≤ +15 KiB gz total across slices (A-slice #440 may use ≤ +12) |
| Postprocessing chunk | never fetched on LITE |

## Today's numbers (main @ 9930ddf)

Renderer: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` (software), Chrome 156.0.8078.4 headless, seed `fox`, median of 3 runs. The absolute budgets are therefore not evaluated here; these rows are the "before" for relative gating.

| profile | quality | fps | p50 ms | p95 ms | first-frame ms |
|---|---|---|---|---|---|
| desktop | default | 1.2 | 816.6 | 899.9 | 1014 |
| low-end-mobile | default | 5.2 | 183.4 | 216.7 | 283 |

## Bundle (`npm run build`, client chunks)

| chunk | gzip KiB |
|---|---|
| `three-*.js` | 145.52 |
| `build-*.js` (contains postprocessing) | 74.70 |
| `tweakpane-*.js` | 30.38 |
| `index-*.js` | 28.46 |
| `index-*.css` | 5.06 |
| `index.html` | 4.10 |
| `mesh-export-*.js` | 0.97 |
| `frost.worker-*.js` | not reported by vite (3.22 kB raw) |

(`gzip KiB` here is vite's "kB" figure, 1 kB = 1000 B.)
