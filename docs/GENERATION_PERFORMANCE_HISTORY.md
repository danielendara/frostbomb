# Snowflake generation performance history

Last updated: 2026-06-12

This document records the measured improvement in snowflake generation from the
initial implementation to the current implementation. It also defines the
comparison profiles and caveats needed to interpret future benchmark results.

## Executive summary

On the same development machine and Node.js environment, the current generator
is approximately **173-179x faster per snowflake** than the initial
implementation:

| Profile | Initial `1eb7d38` | Current `a9d0096` | Speedup |
|---|---:|---:|---:|
| Typical weighted conditions | 1.080 ms/build | 0.00622 ms/build | 173x |
| Complex fernlike stress case | 2.520 ms/build | 0.01405 ms/build | 179x |

The initial and current functions do not perform exactly the same work. The
initial function creates individual Three.js geometries, materials, meshes, and
a group. The current function creates compact typed arrays containing instanced
matrices and growth delays. Normalizing by visible branch count still shows an
improvement of approximately **124-145x per branch**.

Snowflake generation is no longer a meaningful frame-time bottleneck. The
current complex stress case consumes about 0.084% of a 16.67 ms frame budget.
Rendering, shaders, postprocessing, and GPU upload behavior are more likely to
limit interactive performance.

For the complete architectural story, historical local experiments, and a
graph of the evidence, see
[`PERFORMANCE_EVOLUTION.md`](./PERFORMANCE_EVOLUTION.md).

The latest controlled measurement on `71b97b0` recorded:

| Profile | Median | Throughput | Improvement from initial |
|---|---:|---:|---:|
| Typical weighted conditions | 0.006222 ms/build | 160,715 builds/sec | 173.5x |
| Complex fernlike stress case | 0.013892 ms/build | 71,982 builds/sec | 181.4x |

Current main `f44ac51` changes UI and reset-view behavior. Its geometry
generator, random inputs, benchmark files, package manifest, and lockfile are
identical to `71b97b0`, so these generation measurements remain representative
of current main.

## Compared revisions

### Initial implementation

- Commit: `1eb7d387221ce5303c8d00d84a5fd3a9fddf7389`
- Short SHA: `1eb7d38`
- Date: 2026-04-17
- Description: `feat: initialize frostbomb project with snowflake generation`

This is the repository root commit and the oldest revision containing a
runnable `buildSnowflake` implementation.

### Current implementation

- Commit: `a9d0096d9b51be05b0a863395600ed11df059799`
- Short SHA: `a9d0096`
- Date: 2026-06-11
- Description: merge of PR #94, hexagonal symmetry optimization

## Benchmark profiles

Both profiles use deterministic Mulberry32 random-number generation. Each
reported value is the median of five runs in fresh Node.js processes.

### Typical weighted conditions

This profile uses `sampleConditions` with independent deterministic seeds. It
represents the application's weighted mix of dendrites, plates, needles,
columns, and capped columns.

| Revision | Iterations/run | Median | Throughput | Average visible branches |
|---|---:|---:|---:|---:|
| Initial `1eb7d38` | 500 | 1.07951 ms/build | 926 builds/sec | 196.97 |
| Current `a9d0096` | 50,000 | 0.006223 ms/build | 160,696 builds/sec | 140.47 |

The current generator is **173.5x faster per build** and **123.7x faster per
visible branch** in this profile.

### Complex fernlike stress case

This profile fixes the snowflake at -15 C and 0.95 supersaturation, producing a
highly branched fernlike dendrite. The current implementation also receives a
20-point atmospheric path fixed at those conditions.

| Revision | Iterations/run | Median | Throughput | Average visible branches |
|---|---:|---:|---:|---:|
| Initial `1eb7d38` | 250 | 2.51991 ms/build | 397 builds/sec | 453.07 |
| Current `a9d0096` | 100,000 | 0.014047 ms/build | 71,188 builds/sec | 364.99 |

The current generator is **179.4x faster per build** and **144.5x faster per
visible branch** in this profile.

## Recent main-branch comparison

The benchmark was also run immediately before and after PR #94:

| Profile | `a3f6a94` | `a9d0096` | Change |
|---|---:|---:|---:|
| Typical weighted conditions | 0.00570 ms/build | 0.00622 ms/build | about 9% slower |
| Complex fernlike stress case | 0.01348 ms/build | 0.01405 ms/build | about 4% slower |

PR #94 replaces the generic six-arm rotation loop with explicitly unrolled
hexagonal symmetry identities. On this machine, that change does not improve
the complete `buildSnowflake` microbenchmark. The regression is tiny in
absolute terms, but future optimization reviews should preserve and compare
these profiles before claiming an improvement.

## Why generation became faster

The initial implementation was clear but allocation-heavy:

- Recursive growth created `Vector3` objects and segment objects.
- Sixfold symmetry cloned every generated segment.
- Every visible branch created a separate `BoxGeometry` and `Mesh`.
- Every snowflake created a new physical material and Three.js group.
- Matrix composition and trigonometry were performed through general-purpose
  Three.js objects.

The current implementation uses a data-oriented pipeline:

- Recursive growth writes scalar values into shared typed-array scratch
  buffers.
- Sixfold symmetry writes directly into a contiguous matrix buffer.
- One instanced rendering structure replaces hundreds of individual meshes.
- Noise and symmetry constants are initialized once.
- Atmospheric-path parameters are calculated once per path point.
- Growth delays are sorted as compact indices.
- Matrix basis values are calculated during geometry growth and reused.
- The returned arrays are tightly packed for direct renderer consumption.

The most important improvement is architectural: the generator stopped
constructing a large Three.js object graph and became a compact data producer.
The later arithmetic optimizations improve an already-fast pipeline.

## Interpretation caveats

These results are suitable for tracking broad architectural progress, but they
are not a controlled scientific comparison:

1. The initial and current `buildSnowflake` APIs have different responsibilities.
   The initial function constructs meshes; the current function produces data
   for an existing instanced mesh.
2. The two revisions generate different average branch counts and slightly
   different shapes.
3. The historical source was bundled using the currently installed dependency
   set. In particular, the root commit declared Three.js `0.164`, while the
   benchmark used the current installed version.
4. Node.js CPU microbenchmarks do not measure WebGL rendering, GPU transfer,
   postprocessing, first-frame latency, or mobile-device performance.
5. Very short timings are sensitive to CPU contention, thermal state, JIT
   behavior, and garbage collection. Run profiles sequentially in fresh
   processes and report medians rather than a single run.

## Future review procedure

For meaningful future comparisons:

1. Record the full commit SHA, date, Node.js version, CPU, and installed
   dependency versions.
2. Build the benchmark bundle from the exact revision being measured.
3. Warm up the generator before timing.
4. Run each profile at least five times in separate, sequential Node.js
   processes.
5. Report median time, range, throughput, and average visible branch count.
6. Compare output branch counts and visual behavior before accepting a speedup.
7. Run the production build and browser tests after changing geometry logic.

The repository's `benchmark.ts` script is a useful quick local stress check for
`buildSnowflake`. Documented performance claims should still use fresh
processes, both profiles described above, and median reporting—not a single
in-process loop.

## Related performance work

- [`PERFORMANCE_AUDIT.md`](./PERFORMANCE_AUDIT.md) covers live-site network,
  startup, and Lighthouse observations.
- `benchmark.ts` provides a lightweight local geometry check.
- `src/snowflake/geometry.ts` contains the current data-oriented generator.
