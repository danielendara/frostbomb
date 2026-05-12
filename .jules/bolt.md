## 2025-05-14 - [InstancedMesh & DOM Update Bottlenecks]
**Learning:** In Three.js, updating `InstancedMesh` matrices in every frame is expensive. Additionally, using spread operators (`...`) in hot loops causes high garbage collection pressure. Furthermore, frequent DOM attribute updates (e.g., via `dataset`) during animation frames can cause layout thrashing and flakiness in automated tests (Playwright).
**Action:** Gate per-frame updates behind state flags (`needsMatrixUpdate`, `entryActive`). Use direct array index access instead of spread operators in render loops. Implement change detection guards for DOM writes linked to animation states.
**Impact:** Optimization reduced idle update time to effectively 0ms (from ~0.14ms) and improved test stability by eliminating redundant DOM thrashing.

## 2025-05-15 - [Canvas Background Caching]
**Learning:** Re-drawing a dense morphology grid (3750+ iterations of `fillRect` and logic) on every canvas update is a significant bottleneck, especially during interactive "Lab Mode" slider adjustments.
**Action:** Cache the static background (regions, grid, labels) onto an offscreen canvas during initialization. Use `drawImage` to blit the cached result in a single operation during updates.
**Impact:** Rendering performance for the Nakaya diagram improved by ~36x (0.5ms vs 18.5ms for 100 updates).

## 2025-05-16 - [Matrix Composition Optimization]
**Learning:** Three.js `Object3D.updateMatrix()` and `InstancedMesh.setMatrixAt()` perform $O(N)$ full matrix compositions (position, rotation, scale) every frame if called in the render loop. For static or simple-scaled instanced geometry, this is redundant.
**Action:** Pre-compute base transformation matrices during geometry generation (incorporating 6-fold symmetry and branch rotations). During animation, apply manual component-wise scaling to the pre-computed matrix entries (e.g., scaling the first three columns for the 3x3 basis) to bypass `compose()` math. Implement a bulk `TypedArray.set()` fast-path for completed animations.
**Impact:** Significantly reduced CPU overhead in the render loop. Avoided $O(N)$ object property lookups and matrix multiplications per frame.

## 2025-05-17 - [Symmetry-Aware Data Structures & Render Loop]
**Learning:** Even with pre-computed matrices, iterating over 6N instances in the render loop to calculate individual growth animations (e.g., `easeOutExpo`) is redundant for symmetrical structures. Storing 6N metadata objects also increases GC pressure.
**Action:** Streamline `BuildResult` to store only 1/6th of the segment metadata (primary arm). Use a `Float32Array` for animation delays. In the render loop, calculate the animation state once per primary segment and apply it to all six symmetrical matrices using fixed strides in the `instanceMatrix` array.
**Impact:** Reduced easing math and property lookups by 83% (6x) in the hot animation path. Eliminated thousands of short-lived object allocations per snowflake generation.

## 2026-05-05 - [InstancedMesh Reuse & UpdateRange Optimization]
**Learning:** Constant disposal and recreation of `InstancedMesh` during interactive growth (e.g., Lab Mode sliders) causes significant GPU buffer churn and CPU overhead. Additionally, uploading the entire matrix buffer when only a fraction is used is inefficient.
**Action:** Persist the `InstancedMesh` across updates. Implement an adaptive growth strategy with 25% headroom to minimize re-allocations. Use `addUpdateRange` (or `updateRange` depending on Three.js version) to limit GPU data transfer to only the active instance count.
**Impact:** Eliminates frame stutters during rapid parameter adjustments. Reduces GPU memory traffic by up to 80% for smaller snowflakes sharing a large pre-allocated buffer.

## 2026-05-06 - [O(M) Animation Loop & GPU Upload Pruning]
**Learning:** Symmetrical structures like snowflakes can have their animation metadata sorted to enable early-exit in the render loop. Combined with pre-filling the constant parts of the instance matrix, this drastically reduces per-frame CPU work.
**Action:** Sort arm segments by growth delay during geometry generation. In the render loop, use a `break` to stop processing once the growth threshold is reached. Calculate the `maxIndex` reached and use `addUpdateRange` to prune GPU uploads for all 6 symmetry instances. Crucially, call `clearUpdateRanges()` when the animation finishes or during initialization to ensure the full state is uploaded to the GPU.
**Impact:** Reduces render loop complexity from O(N) to O(M) where M is the number of active segments. Eliminates redundant per-frame writes for translation and identity components.

## 2026-05-07 - [Direct TypedArray Generation & Lab Mode Fast-Path]
**Learning:** Intermediate object allocations (like `InstanceData`) in the geometry generation pipeline create significant GC pressure, especially for complex snowflakes with thousands of segments. Additionally, redundant per-frame basis-zeroing during static "Lab Mode" updates consumes unnecessary CPU cycles.
**Action:** Inline transformation logic to populate `matrices` and `delays` Float32Arrays directly from sorted `segments`, eliminating the middleman object. Implement a fast-path in `updateFlake` to skip basis-zeroing and redundant matrix writes when `animate` is false.
**Impact:** Drastically reduced memory overhead and GC churn. Significantly improved responsiveness of Lab Mode sliders by making static updates O(1) buffer copies instead of O(N) loops.

## 2026-05-08 - [Recursive Geometry Calculation Hoisting]
**Learning:** In recursive procedural generation (like snowflake arms), calculating polar-to-cartesian properties (distance from center, angle) inside the recursion is redundant if they can be derived incrementally. Sorting also benefits significantly from pre-calculated comparison keys.
**Action:** Hoist `Math.sqrt` and `Math.atan2` calculations out of the recursion by passing incremental distance and fixed branch angles. Embed animation metadata (`delay`) directly into the segment object during construction to avoid $O(N \log N)$ math in sort comparators. Use additive stride indexing in the symmetry expansion loop to avoid repeated index multiplication.
**Impact:** Reduced snowflake geometry generation time by ~29% (1.14ms to 0.81ms).
