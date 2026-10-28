# ❄️ frost·bomb

A procedurally generated 3D snowflake laboratory in your browser. Every page load grows a unique crystal seeded from the real physics of ice formation — temperature, supersaturation, and the hexagonal symmetry of the H₂O crystal lattice.

**[Live Site](https://frostbomb.com)**

---

## ✨ Features

- **Procedural Growth:** Generates unique geometry based on a 5-character seed.
- **Scientific Accuracy:** Uses the Nakaya morphology diagram to map atmospheric conditions to crystal habits.
- **Atmospheric Path:** Simulates varying conditions as the snowflake "falls," leading to hybrid forms (e.g., plates transitioning to dendrites).
- **Interactive Field Guide & Morphology Diagram:** Explore crystallographic habits with live hover previews, coordinate tracking, and click-to-jump definitions.
- **Lab Mode:** Take manual control of temperature, humidity, and custom seeds to see how they influence growth in real-time.
- **Recent Seeds History:** Automatically retains recently grown crystals in persistent local history with quick revisit pills, optional **Keep** (★) so favorites do not roll off, and undoable history clearing.
- **Visual Modes:**
  - **Pink Mode:** A soft, glowing aesthetic.
  - **Prism Mode:** Dynamic HSL color cycling and chromatic dispersion.
  - **Photo Mode (UI Hide):** Clear away overlays for clean viewing and screenshots, with depth of field on the crystal.
- **Full Accessibility:** Keyboard navigation, skip-to-controls bypass link, roving tabindex for history, screen reader live regions, and `prefers-reduced-motion` synchronization.
- **Interactive Controls:** Full 3D orbit controls, inertia, camera reset, accelerated rotation shortcuts, and smooth growth animations.
- **Export & Share:** Copy full shareable URLs (`?seed=xxxxx`), copy raw seed strings with one click, export high-resolution PNGs, vector SVG paths for laser cutters, or 3D STL/GLB meshes for CAD.

### ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `R` / `Space` | **Regrow** a new random snowflake |
| `D` | Grow **today's crystal** (one seed for the local calendar date) |
| `L` | Toggle **Lab Mode** (manual controls & seed input) |
| `G` | Toggle **Field Guide** |
| `?` | Open Field Guide to **Keyboard Shortcuts** |
| `H` | Toggle **Photo Mode** (hide UI, depth of field) |
| `P` | Toggle **Pink Mode** |
| `M` | Toggle **Prism Mode** (chromatic dispersion) |
| `S` | **Save** current snowflake as high-resolution PNG |
| `E` | **Save** current snowflake as vector SVG (laser / plotter) |
| `T` | **Save** current snowflake as STL and GLB (CAD / print) |
| `A` | Toggle **Auto-Rotate** (respects `prefers-reduced-motion`) |
| `C` | **Copy Link** to current snowflake URL |
| `K` | **Copy Seed** string only |
| `V` | **Reset** 3D camera view |
| `Arrows` | Rotate camera view (`Shift + Arrow` for fast rotation) |
| `Esc` | Close open overlays (Field Guide, Lab Mode) or exit Photo Mode |
| `Home` / `End` | Jump to min (-40°C) / max (0°C) temperature on Nakaya diagram |
| `PgUp` / `PgDn` | Large supersaturation step on Nakaya diagram |

---

## 🔬 The Science

### Nakaya Morphology Diagram
Each flake is grown by sampling a path through the **Nakaya Diagram**, which maps temperature and supersaturation (humidity) to specific crystal habits:

| Conditions | Habit |
|---|---|
| 0 to -3°C, low SS | Hexagonal plate |
| ~-5°C, high SS | Needle |
| -5 to -8°C, low SS | Hollow column |
| -10 to -12°C | Sector plate |
| **-15°C, high SS** | **Stellar / fernlike dendrite** ← The "classic" snowflake |
| -22 to -40°C | Thick plates, columns |

### Hexagonal Symmetry
Real ice (Ice Ih) has a hexagonal crystal structure. `frostbomb` generates one primary arm using seeded-random branching logic and then rotates it 6 times to ensure true crystallographic symmetry.

---

## ⚡ Performance Optimizations

Built with a focus on 60fps performance, sub-millisecond generation, and zero garbage collection pressure:

- **Sequential TypedArray Write Locality:** Groups instance matrix writes sequentially arm-by-arm within contiguous 16-float blocks to maximize CPU write-combining and L1 cache line locality.
- **Segment Buffer Stride Halving (Stride 8):** Halves recursive scratchpad memory allocations from 16 to 8 floats per segment, deriving transformation matrices on-the-fly in a single pass.
- **Non-Allocating In-Place Quicksort:** Replaces standard array sorting with a zero-allocation quicksort to order segment growth delays without GC overhead.
- **GPU Update Ranges:** Uses `addUpdateRange` to transfer only active matrix data to the GPU during growth animations, minimizing PCIe bus bandwidth.
- **Open-Ended Cylinder Geometry:** Uses open-ended geometry for segment instances, pruning thousands of interior end-cap triangles and vertex transforms per frame.
- **Fast Easing Look-Up Table (LUT):** Replaces expensive `Math.pow` calls with a 1024-entry precalculated Float32Array LUT for $O(1)$ growth easing (~7.5x speedup).
- **Trigonometric Expansions:** Particle and camera motions use algebraic trigonometric identities like $\sin(a+b)$ to reduce trigonometry calls by ~99%.
- **Offscreen Diagram Caching:** Pre-renders the Nakaya diagram background grid on an offscreen canvas for a ~36x redraw acceleration during interactive drag adjustments.
- **Zero-Allocation Input Dispatch:** Replaces dynamic handler maps with static switch dispatches during high-frequency keyboard navigation.

Controlled comparisons on the documented benchmark profiles (initial commit `1eb7d38` vs latest full measurement at `71b97b0`) show about **173-181x faster** generation, with the fernlike stress case around **0.014 ms/build**. Geometry and benchmarks on `main` may differ until those profiles are re-run—see the [snowflake generation performance history](docs/GENERATION_PERFORMANCE_HISTORY.md) and [From hundreds of meshes to 181x faster generation](docs/PERFORMANCE_EVOLUTION.md).

---

## 🛠️ Tech Stack

- **Vite** + **TypeScript**
- **Three.js** — WebGL rendering with `MeshPhysicalMaterial` for realistic ice (IOR 1.31, dispersion, transmission, thin-film iridescence, procedural frost).
- **postprocessing** — Bloom, SMAA, and Photo Mode depth of field.
- **Tweakpane** — Lightweight UI for Lab Mode.
- **simplex-noise** — Organic variation in branch thickness and angles.
- **Cloudflare Workers** — Fast edge hosting and static asset delivery.
- **Playwright** — End-to-end accessibility, keyboard navigation, and regression testing.

---

## 🚀 Development

### Setup

Requires **Node.js ≥ 22.12.0** (`package.json` `engines`).

```bash
npm ci
```

### Local Dev
```bash
npm run dev
```
Open `http://localhost:5173`.

### Build & Preview
```bash
npm run build
npm run preview # Serves the Worker locally with Wrangler
```

### Testing
```bash
npm run test:unit          # Vitest unit tests
npm run test:e2e:smoke     # Smoke Playwright project only (sequential-smoke; same as default CI e2e)
npm run test:e2e:full      # Full chromium project plus smoke (all Playwright projects)
npm test                   # pretest runs unit tests, then smoke Playwright project only (`--project=sequential-smoke`)
```

`playwright.config.ts` always declares both projects; `npm test` and `npm run test:e2e:smoke` narrow to smoke via `--project=sequential-smoke`. Use `npm run test:e2e:full` for the full chromium suite.

### CI

Workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml) on `push` to `main`, `pull_request`, and `workflow_dispatch` (optional `full_e2e` input, default `true`).

Every run executes `npm run build`, the AGENTS.md policy check, the three.js chunk budget (`scripts/check-three-chunk-budget.mjs`), `npm run typecheck:tests`, and `npm run test:unit`; unless Playwright is skipped it then runs either `npm run test:e2e:smoke` (default) or `npm run test:e2e:full`. The smoke/full/skip decision comes from `scripts/e2e-mode.sh`, which `npm run verify` also uses locally (`--local`, diffing against `origin/main`).

| When | Playwright |
| --- | --- |
| PR or push changes only `*.md`, `docs/*`, or `LICENSE` | **Skipped** (`skip_playwright`) |
| PR from `dependabot[bot]` that changes only `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock` | **Skipped** |
| Otherwise | **Runs** — smoke by default |
| PR has label `full-e2e` | Full suite (`npm run test:e2e:full`) |
| PR or push touches `src/snowflake/*`, `src/ui/*`, `src/main.ts`, `src/style.css`, `index.html`, `playwright.config.ts`, `vite.config.ts`, `src/*` paths matching `canvas` / `webgl` / `export`, or `tests/*` except `*.smoke.spec.ts` | Full suite |
| `workflow_dispatch` with `full_e2e: true` | Full suite |
| `workflow_dispatch` with `full_e2e: false` | Smoke only |

### Deployment
```bash
npm run deploy # Deploys to Cloudflare Workers (`npm run build && wrangler deploy`)
```

Full Worker release steps (build, unit, e2e, live CSP / `_headers` / postprocessing-not-modulepreloaded check, rollback): [docs/RELEASE.md](docs/RELEASE.md).

---

## 🔗 Sharing

Every snowflake has a unique seed. Share a specific crystal by appending `?seed=xxxxx` to the URL:

`https://frostbomb.com/?seed=k3m7q`

---

*“A snowflake is one of God's most fragile creations, but look what they can do when they stick together.”*
