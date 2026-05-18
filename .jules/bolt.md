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

## 2026-05-14 - [Manual Matrix Composition for Geometry Generation]
**Learning:** Using `THREE.Object3D.updateMatrix()` followed by manual rotation for symmetry in a hot loop (like snowflake geometry generation) is significantly slower than direct manual matrix construction. Manual construction allows for leveraging existing trigonometric values (like `dirX` and `dirY`) and avoiding redundant calculations within the `Object3D` abstraction.
**Action:** For high-frequency geometry generation or updates involving many instances, bypass `Object3D` and use manual matrix population. Reuse pre-calculated trigonometric constants for symmetry or repetitive rotations.
**Impact:** Optimization reduced average `buildSnowflake` time by ~32% (from 0.207ms to 0.140ms).

## 2026-05-15 - [Easing Function LUT]
**Learning:** High-frequency animation loops (like snowflake growth) that call `Math.pow` for thousands of instances per frame create significant CPU overhead. For standard easing functions on a fixed [0, 1] domain, a Look-Up Table (LUT) is a highly effective O(1) replacement.
**Action:** Replace expensive mathematical easing calls in hot loops with pre-calculated Float32Array LUTs. Use bitwise truncation for fast indexing.
**Impact:** Optimization achieved a ~7.5x speedup per call, saving tens of thousands of `Math.pow` calls per second.

## 2026-05-16 - [Recursive Geometry Memory & Math Optimizations]
**Learning:** Storing unused spatial properties (startX, endX, dist, etc.) in every recursive segment of a snowflake creates unnecessary memory pressure and GC churn. Additionally, standard divisions and redundant trig multiplications in the recursion branch points add measurable overhead.
**Action:** Trim the `Segment` interface to strictly used properties for matrix generation. Replace divisions with multiplications of pre-calculated inverse constants. Pre-calculate common rotation products once per branch pair to halve the multiplication count in side-branch vector math.
**Impact:** Significantly reduced memory footprint per generated snowflake. Improved recursion speed by minimizing stack frame size and arithmetic operations.

## 2026-05-17 - [Segment-Major Layout & Dynamic Draw Pruning]
**Learning:** For symmetrical structures (like 6-fold snowflakes), an "arm-major" layout (storing all segments of arm 1, then arm 2, etc.) forces multiple fragmented GPU uploads and prevents efficient draw pruning. A "segment-major" layout (storing all 6 symmetry instances of segment 0, then segment 1, etc.) allows for contiguous memory access and a single GPU update range.
**Action:** Group symmetry instances contiguously in the `matrices` Float32Array. Update the render loop to utilize this layout and dynamically adjust `mesh.count` to prune non-grown segments from the GPU pipeline.
**Impact:** Reduced GPU upload calls from 6 to 1 per frame. Significantly decreased vertex shader pressure by skipping rendering for segments that haven't started growing.
