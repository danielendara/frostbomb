# frostbomb backlog

Lightweight project backlog for upcoming improvements. Keep items small enough to finish in a focused session, and move completed work into the completed section or release notes instead of letting this file become out of date.

## Next

### 3D Model Export (STL / GLTF) for 3D Printing (#234)
- Goal: allow users to export watertight 3D models of generated crystals for 3D printing.
- Scope: merge instanced matrices into unified geometry and export binary `.stl` or `.gltf`.

### Advanced Ice Crystal Shaders (#235)
- Goal: elevate visual realism with optical physics.
- Remaining: Photo Mode depth of field.
- Done: thin-film iridescence; procedural frost roughness/normal maps and sheen on the shared ice material.

### Add production monitoring
- Goal: catch live runtime errors and deploy regressions quickly.
- Ideas: Cloudflare Web Analytics, Worker logs, browser error reporting, uptime check.
- Done means: live errors and traffic health are visible without opening DevTools.

### Measure first-load experience on real devices
- Goal: understand whether the Three.js and postprocessing chunks are acceptable on mobile.
- Ideas: Lighthouse, WebPageTest, Chrome Performance panel, reduced-motion comparison.
- Done means: baseline metrics are recorded for desktop and mobile, with one or two concrete follow-up tasks.

### Tune postprocessing loading
- Goal: preserve visual polish while minimizing startup cost.
- Ideas: load bloom only after first interaction, disable postprocessing on low-power devices, compare before/after screenshots.
- Done means: first render stays fast and visual difference is intentional.

### Refine mobile layout
- Goal: make controls feel as intentional on small screens as they do on desktop.
- Ideas: test narrow devices, reduce footer crowding, tune field guide height.
- Done means: core controls are comfortable at 360px width with no overlap.

### Add release checklist
- Goal: make deploys predictable.
- Ideas: build, test, deploy, live header check, live smoke check, rollback note.
- Done means: a short checklist exists and matches the Worker deploy flow.

---

## Completed

- [x] **Vector SVG path export (#236):** 2D projection of hexagonal-cylinder instances to filled SVG polygons, 100mm long-axis export, `E` shortcut.
- [x] **Modularize monolithic files (#237):** Extracted UI and scene subsystems from `main.ts` and `scene.ts` into `src/ui/` and `src/snowflake/` domain modules.
- [x] **Configure canonical domain behavior:** Added `<link rel="canonical" href="https://frostbomb.com/" />` and domain metadata.
- [x] **Improve share previews:** Added Open Graph, Twitter Cards, responsive social preview metadata and OG image (`og-image.png`).
- [x] **Add install/run documentation for Workers:** Documented development, testing, preview, and deployment commands in `README.md`.
- [x] **Add canvas smoke checks & test suite:** Added comprehensive Playwright end-to-end tests covering rendering, keyboard shortcuts, accessibility, reduced motion, and linked navigation.
- [x] **Improve copy/share feedback:** Added dedicated accessible clipboard handling, fallback copy mechanisms, visual highlight feedback, and live region announcements.
- [x] **Add seed persistence affordances:** Implemented Recent Seeds list with `localStorage` persistence, clear history with undo, direct seed input in Lab Mode, and a dedicated Copy Seed button/shortcut (`K`).
- [x] **Add dependency update cadence:** Configured automated weekly dependency updates with GitHub Dependabot (`.github/dependabot.yml`).
- [x] **Photo Mode & UI Toggle:** Added full UI hide/show toggle (`H`) for clean screenshots and immersive viewing.
- [x] **Comprehensive Keyboard Navigation:** Full shortcut coverage (`R`, `Space`, `L`, `G`, `?`, `H`, `P`, `M`, `S`, `E`, `A`, `C`, `K`, `V`, `Arrows`, `Home`, `End`, `PgUp`, `PgDn`, `Esc`).
- [x] **High-Performance Geometry Engine (Bolt):** Optimized geometry generation to sub-millisecond execution (<0.014ms per flake, ~181x faster than initial) via sequential TypedArray write grouping, stride-8 segment packing, in-place quicksort, pre-calculated branch decay, and LUT easing.

