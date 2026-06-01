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
**Impact:** Reduces render loop complexity from O(N) to O(M) where M is the number of active segments. Eliminated thousands of per-frame writes for translation and identity components.

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

## 2026-05-18 - [Buffer Reuse Safety in Performance-Critical Loops]
**Learning:** Skipping zero-value writes in matrix population loops is a common micro-optimization, but it is unsafe if the underlying `Float32Array` buffer is reused or pooled. Stale data from previous generations can cause non-deterministic visual glitches.
**Action:** Always explicitly initialize all 16 indices of a transformation matrix in hot loops, even for identity components and zeros, unless the buffer is guaranteed to be zero-allocated (e.g., via `new Float32Array()` without reuse).
**Impact:** Ensures rendering correctness across multiple snowflake regenerations without compromising the performance gains of manual matrix construction.

## 2026-05-20 - [Data-Oriented Segment Buffer & Trig Approximations]
**Learning:** Procedural generation of tree-like structures (like snowflake arms) using recursive functions that return or allocate objects causes significant GC pressure. Transitioning to a Data-Oriented Design (DOD) with pre-allocated `Float32Array` buffers eliminates this churn. Furthermore, for small-angle jitter or perturbations, 2nd-order Taylor expansions are a faster alternative to standard `Math.sin`/`Math.cos` calls.
**Action:** Refactor recursive generation to write directly into a flat `Float32Array` (the `SEGMENT_BUFFER`) with a fixed stride (e.g., 8). Use 2nd-order Taylor series approximations for small-angle trigonometric perturbations in hot recursive paths.
**Impact:** Eliminated thousands of short-lived object allocations per snowflake generation, significantly reducing garbage collection overhead. Improved cache locality for subsequent sorting and matrix population phases.

## 2026-05-21 - [Recursive Loop & Animation Hoisting]
**Learning:** Even in highly optimized procedural generation, redundant multiplications within recursive loops (like `i * invNumSteps`) and invariant calculations within symmetry loops (like Z-axis basis components) add measurable CPU overhead when scaled to thousands of instances.
**Action:** Replace loop-index multiplications with additive tracking for distance and progress in `buildArm`. Hoist invariant Column 2 and Column 3 Z-basis components outside the inner symmetry loop in the animation path. Pre-calculate path sampling scale once per snowflake.
**Impact:** Further reduces CPU cycles in both the geometry generation and the hot animation path, ensuring high framerates even for the most complex dendrites.

## 2026-05-22 - [Recursive Loop Strength Reduction & Animation Pruning]
**Learning:** In deep recursion with iterative loops (like branching arms), replacing coordinate scaling (e.g., `pointX * 2`) and linear factor calculations (e.g., `1 - t * 0.4`) with additive tracking significantly reduces multiplication overhead. Additionally, in growth animations, leveraging `TypedArray.set()` for fully-grown segments combined with a sliding `minAnimatedIndex` allows for pruning the render loop from O(N) to O(M), where M is the number of currently active/changing segments.
**Action:** Always look for opportunities to replace repeated multiplications with additive updates in hot recursive loops. Use bulk memory operations (`memcpy` via `set`) for static states within dynamic buffers.
**Impact:** Combined optimizations reduced average generation time by ~43% (0.090ms to 0.051ms) and drastically reduced per-frame CPU load as the animation progresses.

## 2026-05-23 - [Hot Loop Hoisting & Geometric Ratio Optimization]
**Learning:** Redundant property access to `Float32Array` within animation loops (e.g., snowfall particles) adds measurable overhead due to repeated index calculations. In geometry generation, the primary arm's matrix population can be optimized by exploiting the geometric relationship between basis vectors (e.g., using a ratio $K = (cax \cdot sy) / sx$) to bypass redundant trigonometric multiplications.
**Action:** Hoist index calculations (`i * stride`) into local variables within animation loops. Replace redundant matrix multiplications with pre-calculated ratios in the symmetry population phase. Deduplicate state update logic in recursive paths.
**Impact:** Reduced average generation time for "Standard" snowflakes to ~0.050ms and improved snowfall particle animation efficiency.

## 2026-05-24 - [Hoisted Delay Multiplication & Unchecked Easing Safety]
**Learning:** Hoisting constant multipliers from the per-frame render loop into the one-time geometry generation phase (e.g., doubling animation `delays`) yields a "free" performance win. However, using unchecked Look-Up Table (LUT) access in the hot loop for performance requires strict input clamping at the call-site to prevent `NaN` results from out-of-bounds indices, which can break rendering.
**Action:** Pre-calculate render-loop constants during geometry generation whenever possible. Always wrap unchecked LUT access with lightweight local clamps (e.g., `progress < 0 ? 0 : progress`) to maintain both speed and stability.
**Impact:** Optimization reduced growth animation loop execution time by ~30% (~0.008ms to ~0.0057ms) and overall generation time by ~10% via hoisted pre-calculations.

## 2026-05-26 - [Module-Scope Constant Hoisting & Trig Literal Replacement]
**Learning:** Constants like `S60` (sin 60°) defined inside hot loops (like the `buildSnowflake` matrix population) incur redundant assignment overhead over thousands of iterations. Additionally, calling `Math.cos()` and `Math.sin()` for fixed angles (like habit-specific side-branch angles) is slower than using pre-calculated literals. However, avoid using module-level shared buffers for return values (like built matrices) to maintain function reentrancy and prevent silent data corruption.
**Action:** Hoist loop-invariant constants to module scope. Replace fixed trigonometric calls with pre-calculated literals. Prioritize functional correctness over micro-allocations in factory functions.
**Impact:** Optimization reduced 'buildSnowflake' average time by ~11% (from 0.046ms to 0.041ms) without compromising reentrancy.
