## 2025-05-14 - [InstancedMesh & DOM Update Bottlenecks]
**Learning:** In Three.js, updating `InstancedMesh` matrices in every frame is expensive. Additionally, using spread operators (`...`) in hot loops causes high garbage collection pressure. Furthermore, frequent DOM attribute updates (e.g., via `dataset`) during animation frames can cause layout thrashing and flakiness in automated tests (Playwright).
**Action:** Gate per-frame updates behind state flags (`needsMatrixUpdate`, `entryActive`). Use direct array index access instead of spread operators in render loops. Implement change detection guards for DOM writes linked to animation states.
**Impact:** Optimization reduced idle update time to effectively 0ms (from ~0.14ms) and improved test stability by eliminating redundant DOM thrashing.

## 2025-05-15 - [Canvas Background Caching]
**Learning:** Re-drawing a dense morphology grid (3750+ iterations of `fillRect` and logic) on every canvas update is a significant bottleneck, especially during interactive "Lab Mode" slider adjustments.
**Action:** Cache the static background (regions, grid, labels) onto an offscreen canvas during initialization. Use `drawImage` to blit the cached result in a single operation during updates.
**Impact:** Rendering performance for the Nakaya diagram improved by ~36x (0.5ms vs 18.5ms for 100 updates).
