# frostbomb backlog

Lightweight project backlog for upcoming improvements. Keep items small enough to finish in a focused session, and move completed work into the completed section or release notes instead of letting this file become out of date.

## Next

### Add production monitoring
- Goal: catch live runtime errors and deploy regressions quickly.
- Ideas: Cloudflare Web Analytics, Worker logs, browser error reporting, uptime check.
- Done means: live errors and traffic health are visible without opening DevTools.
- [x] Browser error reporting → Workers Logs via `POST /api/client-error` (#356; see `docs/RELEASE.md`).
- [ ] Traffic health / uptime check.

### Measure first-load experience on real devices
- Goal: understand whether the Three.js and postprocessing chunks are acceptable on mobile.
- Ideas: Lighthouse, WebPageTest, Chrome Performance panel, reduced-motion comparison.
- Done means: baseline metrics are recorded for desktop and mobile, with one or two concrete follow-up tasks.

### Tune postprocessing loading
- Goal: preserve visual polish while minimizing startup cost.
- Ideas: load bloom only after first interaction, disable postprocessing on low-power devices, compare before/after screenshots.
- Done means: first render stays fast and visual difference is intentional.

---

## Completed

- [x] **Add release checklist (#280):** `docs/RELEASE.md` covers Worker build, unit, e2e, `npm run deploy`, live CSP/`_headers`/postprocessing-not-modulepreloaded checks, and rollback via `npx wrangler rollback <version-id>`.
- [x] **3D model export (#234):** Merged instanced hex-cylinders to binary STL + GLB (50mm long axis). Overlapping segments, not a watertight boolean union.
- [x] **Ice crystal shaders (#235):** Thin-film iridescence, procedural frost grain, and Photo Mode depth of field.
- [x] **Vector SVG path export (#236):** 2D projection of hexagonal-cylinder instances to filled SVG polygons, 100mm long-axis export, `E` shortcut.
- [x] **Modularize monolithic files (#237):** Extracted UI and scene subsystems from `main.ts` and `scene.ts` into `src/ui/` and `src/snowflake/` domain modules.
- [x] **Configure canonical domain behavior:** Added `<link rel="canonical" href="https://frostbomb.com/" />` and domain metadata.
- [x] **Improve share previews:** Added Open Graph, Twitter Cards, responsive social preview metadata and OG image (`og-image.png`).
- [x] **Add install/run documentation for Workers:** Documented development, testing, preview, and deployment commands in `README.md`.
- [x] **Add canvas smoke checks & test suite:** Playwright e2e (smoke + full), unit tests, and `tests/canvas-marks.smoke.spec.ts` for canvas + performance marks.
- [x] **Improve copy/share feedback:** Added dedicated accessible clipboard handling, fallback copy mechanisms, visual highlight feedback, and live region announcements.
- [x] **Add seed persistence affordances:** Implemented Recent Seeds list with `localStorage` persistence, clear history with undo, direct seed input in Lab Mode, and a dedicated Copy Seed button/shortcut (`K`).
- [x] **Add dependency update cadence:** Configured automated weekly dependency updates with GitHub Dependabot (`.github/dependabot.yml`).
- [x] **Photo Mode & UI Toggle:** Added full UI hide/show toggle (`H`) for clean screenshots and immersive viewing.
- [x] **Comprehensive Keyboard Navigation:** Full shortcut coverage (`R`, `Space`, `L`, `G`, `?`, `H`, `P`, `M`, `S`, `E`, `T`, `A`, `C`, `K`, `V`, `Arrows`, `Home`, `End`, `PgUp`, `PgDn`, `Esc`).
- [x] **High-Performance Geometry Engine (Bolt):** Controlled benchmarks at `71b97b0` show ~173-181x faster generation vs the initial commit; see `docs/GENERATION_PERFORMANCE_HISTORY.md` (re-run profiles after geometry changes).
- [x] **Refine mobile layout:** `tests/mobile-360.smoke.spec.ts` covers 360×640 overlap, tap targets, and no horizontal scroll.

