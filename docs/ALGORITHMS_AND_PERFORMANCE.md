# Algorithms and performance

This document describes frostbomb's current algorithms, their complexity, and
the performance evolution visible in `main` branch history.

Last reviewed: 2026-06-07

## Executive summary

Frostbomb began as an object-oriented Three.js implementation: recursive growth
created many `Vector3`, segment, geometry, and mesh objects, then rendered each
visible branch separately. The current pipeline is data-oriented:

- one arm is generated recursively into shared typed scratch buffers;
- sixfold symmetry is expanded directly into packed 4x4 matrices;
- all branches render through one `InstancedMesh`;
- entry animation touches only the active segment window;
- GPU uploads are restricted to one contiguous changed range;
- static or expensive UI/rendering work is cached, reused, deferred, or paused.

The asymptotic cost of generating a crystal is still proportional to the number
of generated segments, plus a sort. The large improvement is in constants:
fewer allocations, fewer general-purpose Three.js operations, fewer draw calls,
less per-frame arithmetic, and less CPU-to-GPU transfer.

Current repository benchmarks on this machine:

| Benchmark | Result |
|---|---:|
| `benchmark_long.ts`, 100,000 builds | ~0.011 ms/build |
| `benchmark_bolt.ts`, three 5,000-build runs | ~0.0130-0.0138 ms/build |
| Average primary-arm segments in those profiles | ~60-61 |

These are Node CPU microbenchmarks of `buildSnowflake`, not browser frame-time
or end-to-end startup measurements.

## Complexity notation

| Symbol | Meaning |
|---|---|
| `S` | generated segments in one primary arm |
| `I` | visible branch instances, approximately `6S + 1` |
| `A` | segments actively changing during a growth-animation frame |
| `P` | snowfall particles, currently 80 or 200 |
| `L` | atmospheric path points, normally 1 or 6 |
| `W`, `H` | Nakaya diagram dimensions |

## End-to-end generation pipeline

### 1. Seed resolution and deterministic random numbers

Files: `src/snowflake/random.ts`, `src/main.ts`

Shared seed labels are hashed to a 32-bit value with an FNV-1a-style loop.
Mulberry32 then produces the deterministic random sequence used by condition
sampling and branch generation.

- Seed hashing: `O(label length)`, constant memory.
- Each PRNG call: `O(1)`, allocation-free.
- Same valid URL seed produces the same snowflake.

### 2. Atmospheric-condition sampling

Files: `src/snowflake/nakaya.ts`, `src/snowflake/morphology.ts`

`sampleConditions` uses weighted regions so recognizable dendrites occur more
often than rarer habits. It generates a short atmospheric random walk, clamped
to valid temperature and supersaturation ranges.

`getHabit` is a constant-time decision tree approximating the Nakaya morphology
diagram. Each path point is converted once into `GrowthParams` before recursive
growth begins.

- Sampling and habit lookup: `O(L)`.
- Parameter lookup during recursion: `O(1)`.
- Important optimization: morphology switch logic is not repeated for every
  generated segment.

### 3. Recursive primary-arm growth

Files: `src/snowflake/geometry.ts`, `src/snowflake/morphology.ts`

`buildArm` recursively grows a single arm in the XY plane. Each segment may
spawn paired side branches. Branch probability and length decay toward the tip,
while depth and a hard segment cap bound the recursion.

Current implementation details:

- scalar coordinates replace temporary `Vector3` objects;
- a module-scope `Float32Array` stores eight numbers per segment;
- a fixed simplex-noise instance adds deterministic organic variation;
- additive tracking replaces repeated position, probability, path-index, and
  noise-coordinate calculations;
- hot RNG helpers are inlined;
- small angle perturbations use second-order Taylor approximations instead of
  repeated `Math.sin` and `Math.cos`;
- generation stops at 10,000 primary-arm segments.

Complexity:

- Time: `O(S)`, excluding the later sort.
- Scratch memory: fixed capacity for 10,000 segments.
- Returned memory: proportional to `S`.

The recursive branching factor can grow quickly for fernlike dendrites, but
depth, length decay, probability decay, and the segment cap keep it bounded.

### 4. Growth ordering

File: `src/snowflake/geometry.ts`

Each generated segment receives a growth delay. Delay and source index are
packed into a 32-bit integer:

- low 14 bits: source segment index;
- upper bits: quantized delay.

The relevant portion of a shared `Uint32Array` is sorted with the native numeric
typed-array sort. This establishes growth order and allows animation to stop
scanning as soon as it reaches a future segment.

- Time: `O(S log S)`.
- Additional allocation: none for sorting; the shared sort buffer is reused.
- Historical improvement: commit `c130a43` reported the sorting phase about 6x
  faster and total generation about 10% faster than comparator-based sorting.

### 5. Matrix generation and sixfold symmetry

File: `src/snowflake/geometry.ts`

For each sorted primary-arm segment, the generator directly writes six 4x4
instance matrices into a `Float32Array`. It does not create `Object3D` instances
or call `updateMatrix`.

The matrices use segment-major layout:

```text
segment 0: arm 0, arm 1, arm 2, arm 3, arm 4, arm 5
segment 1: arm 0, arm 1, arm 2, arm 3, arm 4, arm 5
...
```

The symmetry loop is unrolled:

- arm 0 is calculated directly;
- arm 1 uses hoisted 60-degree components;
- arm 2 uses the identity `R(120°) = R(60°) - I`;
- arms 3-5 are negations of arms 0-2.

Small rotational jitter also uses a Taylor approximation. Static matrix values
are written once.

- Time: `O(S)`, with six fixed matrix writes per segment.
- Returned matrix memory: `S * 6 * 16 * 4` bytes, or `384S` bytes.
- Returned delay memory: `4S` bytes.
- Example at 61 arm segments: roughly 23 KiB of matrix data.

## Rendering and animation

### Instanced rendering

Files: `src/snowflake/scene.ts`, `src/snowflake/flake-animation.ts`

All branches share one cylinder geometry, one ice material, and one
`InstancedMesh`. The central core is one additional mesh.

The initial implementation created a `BoxGeometry` and `Mesh` for every visible
branch. The current design reduces branch rendering from approximately `I` draw
submissions and scene objects to one instanced branch submission plus the core.
Actual draw-call counts can vary with Three.js material passes and
postprocessing, but they no longer scale linearly with branch count.

The instanced mesh is reused between generations. It is only recreated when a
new snowflake exceeds current capacity, and new allocations include 25%
headroom.

### Growth-entry animation

File: `src/snowflake/flake-animation.ts`

Before animated growth starts, final matrices are copied into the instance
buffer and only their 3x3 basis values are zeroed. Translation and identity
components stay fixed.

During each frame:

1. Completed contiguous segments are copied in one `TypedArray.set`.
2. Only currently growing segments have basis values recalculated.
3. Future segments are skipped because delays are sorted.
4. All six symmetric instances reuse one easing result.
5. One contiguous GPU update range describes the changed window.

Complexity:

- Initial animated preparation: `O(I)`.
- Active animation frame: `O(A)`, rather than `O(I)`.
- Completed or Lab Mode update: bulk `TypedArray.set`, effectively `O(I)` with
  a low native-copy constant.
- GPU transfer: proportional to the changed contiguous window, not the entire
  instance buffer.

Historical commits document the progression:

- `789dcb3`: precomputed matrices and removed per-frame `Object3D.updateMatrix`.
- `582b945`: reduced animation writes by about 44% by updating basis values only.
- `8e37124` / `cf42080`: changed frame work from all segments to active segments
  and added partial GPU uploads.
- `8cf83b6`: changed to segment-major layout, reducing upload ranges from six to
  one and improving cache locality.
- `5be8fcb`: batched completed-segment copies; reported about 30% less animation
  loop overhead.

### Easing

File: `src/snowflake/easing.ts`

Ease-out-exponential values are precomputed in a 1,024-entry `Float32Array`.
Animation performs indexed lookups instead of `Math.pow` for every active
segment.

- Initialization: `O(1024)`, once per module load.
- Lookup: `O(1)`.
- Memory: 4 KiB.
- Commit `3a1d0e6` measured about 7.5x faster easing calls over 10 million calls.

The unchecked lookup is only used where animation guards guarantee the input is
inside the valid interval.

### Snowfall particles

File: `src/snowflake/particles.ts`

Snowfall uses one `Points` object and typed arrays for positions, velocities,
and precomputed phase components. The identity
`sin(time + phase) = sin(time)cos(phase) + cos(time)sin(phase)` reduces
per-frame trigonometry from `P` sine calls to one sine and one cosine.

- Per-frame time: `O(P)`.
- Particle count: 200 normally, 80 with reduced motion.
- Draw submissions: one points draw.
- Per-frame allocations: none in the update loop.

### Frame lifecycle and adaptive quality

File: `src/snowflake/scene.ts`

- Rendering pauses while the document is hidden.
- Postprocessing is dynamically imported after the lightweight first render.
- Postprocessing is skipped for reduced-motion users.
- Pixel ratio is capped and drops to a 0.75 quality scale after sustained slow
  frames.
- Reduced motion disables auto-rotation and entry growth, lowers particle count,
  and limits initial quality.
- Event listeners, Three.js resources, generated textures, particles, timers,
  renderer, and composer have explicit disposal paths.

This work reduces wasted background CPU/GPU time, startup work, and the risk of
resource leaks during scene teardown.

## Supporting algorithms

### Nakaya diagram caching

File: `src/snowflake/diagram.ts`

The morphology background samples a grid and calls `getHabit` for approximately
`(W / 4) * (H / 4)` cells. That static background is rendered once to an
offscreen canvas. Updates blit the cached image and draw only the short
atmospheric path.

- Initialization: `O(WH / 16)`.
- Update: `O(WH)` native canvas blit plus `O(L)` path drawing.
- Avoided per update: thousands of JavaScript `getHabit` and `fillRect` calls.
- Commit `3061679` reported about 36x faster updates: 0.5 ms versus 18.5 ms for
  100 mocked-canvas updates.

### Procedural material textures

File: `src/snowflake/materials.ts`

The ice bump map computes three octaves of simplex noise for each pixel of a
512x512 canvas. The environment map fills a 512x256 RGBA typed array with a
studio-lighting gradient and two bright regions.

- Bump-map initialization: `O(512 * 512 * 3)`.
- Environment-map initialization: `O(512 * 256)`.
- Runtime per-frame cost: texture sampling occurs on the GPU; CPU generation is
  paid once when the scene is created.
- Memory before GPU-side representation: about 1 MiB for the bump-map pixels and
  512 KiB for the environment-map array.

These textures improve visual quality but add startup CPU work. They were added
in commit `5893c58`, after the existing performance audit, and should be
included in future first-frame measurements.

### Lazy Lab Mode controls

File: `src/main.ts`

Tweakpane is dynamically imported only when Lab Mode is first opened. Lab Mode
slider changes preserve the seed and disable entry animation, using the bulk
matrix-update path instead.

This keeps the large Tweakpane chunk out of initial execution and avoids
restarting an expensive visual animation during rapid input.

## Historical evolution

### Initial implementation: `1eb7d38`

The first version was clear and idiomatic, but allocation- and draw-call-heavy:

- recursive growth built arrays of segment objects and `Vector3` clones;
- sixfold symmetry cloned every segment into another object array;
- every visible segment created its own `BoxGeometry` and `Mesh`;
- regeneration removed and disposed each child geometry;
- entry animation scaled the entire holder and evaluated `Math.pow` every frame.

Generation was broadly `O(S)`, but visible object count, geometries, draw
submissions, allocations, and disposal work all scaled with approximately `6S`.

### Instancing and lifecycle: `7be6070`, `063bc7e`

The renderer moved to `InstancedMesh`, turning branch draw submissions into a
constant-sized rendering structure. Later lifecycle work paused hidden-page
rendering, respected reduced motion, deferred postprocessing, and improved
resource disposal.

### Data-oriented geometry: `3828de3` through `6e46380`

The pipeline progressively replaced vectors, segment objects, temporary
instance objects, and general Three.js matrix composition with primitive scalar
math, shared typed scratch buffers, and direct matrix population.

Selected recorded measurements:

| Commit | Recorded result |
|---|---|
| `3828de3` | ~35% faster generation in its 500-iteration benchmark |
| `ef49261` | 0.2069 ms to 0.1404 ms, ~32% faster matrix generation pipeline |
| `42824d5` | 0.117 ms to 0.044 ms, ~62% reduction for its complex profile |
| `c130a43` | 0.051 ms to 0.044 ms overall; sorting phase ~6x faster |
| `e1c2f7b` | 0.0403 ms to 0.0300 ms after 60-degree rotation hoisting |

These values came from different historical benchmark revisions, machines, and
code states. They show direction and local improvement, but should not be
multiplied together or treated as one controlled longitudinal benchmark.

### Current benchmark

The repository's current `benchmark_long.ts` and `benchmark_bolt.ts` were
bundled with the installed esbuild and run under Node:

```bash
node_modules/.bin/esbuild benchmark_long.ts --bundle --platform=node \
  --format=esm --outfile=/tmp/frostbomb-benchmark-long.mjs
node /tmp/frostbomb-benchmark-long.mjs
```

Observed results:

- long benchmark: ~0.011 ms/build over 100,000 builds;
- shorter benchmark: ~0.0130-0.0138 ms/build across three runs;
- roughly 60-61 primary-arm segments, or about 361-367 visible branches
  including the core.

This suggests the current generator is fast enough that normal interaction is
more likely to be limited by WebGL rendering, postprocessing, startup texture
generation, or device GPU capability than by `buildSnowflake`.

## Performance limits and risks

1. **No controlled baseline benchmark exists.** Historical numbers are useful
   but not directly comparable. Preserve benchmark fixtures and environment
   metadata before claiming an overall speedup.
2. **Canvas-first startup is poorly represented by Lighthouse.** The existing
   audit could not obtain LCP or TBT. Add project-specific performance marks.
3. **Procedural material maps add startup CPU cost.** Their effect has not yet
   been measured in the performance audit.
4. **Postprocessing and physical transmission remain GPU-heavy.** Instancing
   reduces CPU and draw overhead, but fragment shading cost still depends on
   resolution, overdraw, and device GPU.
5. **Shared geometry scratch buffers make generation non-reentrant.**
   `buildSnowflake` is safe for sequential main-thread use because returned
   arrays are copied, but concurrent calls would contend for module-scope
   buffers.
6. **The 10,000-segment cap and 14-bit packed index are coupled.** Raising the
   cap beyond 16,383 requires changing the packed sort representation.
7. **Micro-optimizations rely on visual tolerances.** Taylor approximations,
   quantized delays, and lookup-table easing trade tiny numerical differences
   for speed. Regression tests should continue covering visual behavior.

## Recommended measurement work

The next performance work should improve observability rather than add more hot
path arithmetic:

- mark `first-flake-built`, `first-frame-rendered`, and
  `postprocessing-ready`;
- add a browser benchmark for Lab Mode update latency and growth-frame CPU time;
- record GPU/render timings on a representative mobile device;
- measure scene creation before and after procedural texture generation;
- turn the current geometry benchmark into a repeatable script with fixed
  profiles, independent seeds, runtime metadata, and percentile reporting.

