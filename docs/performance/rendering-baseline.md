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
- `--quality=rich|lite` is passed as `?quality=` (the debug tier override, A4). Without it the tier is chosen automatically: the `low-end-mobile` profile (coarse pointer, 360 px) starts on LITE, `desktop` on RICH. The override is not written to share links.
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

## Bundle (`npm run build`, client chunks; main @ 07e8008)

| chunk | gzip KiB |
|---|---|
| `three-*.js` | 144.90 |
| `build-*.js` (contains postprocessing) | 74.72 |
| `tweakpane-*.js` | 30.38 |
| `index-*.js` | 31.91 |
| `index-*.css` | 5.19 |
| `index.html` | 4.10 |
| `mesh-export-*.js` | 1.01 |
| `frost.worker-*.js` | not reported by vite (4.19 kB raw) |

(`gzip KiB` here is vite's "kB" figure, 1 kB = 1000 B.)
