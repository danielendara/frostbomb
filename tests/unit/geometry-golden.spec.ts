/**
 * Golden crystal fingerprints: "same seed => same crystal".
 *
 * `?seed=abcde` share links, Recent Seeds and Back/Forward all rely on
 * hashString -> mulberry32 -> sampleConditions -> buildSnowflake growing the
 * exact same flake forever. `buildSnowflake` is hand-optimised (shared scratch
 * buffers, LUTs, a custom sort, a pooled params array), so a change that
 * reorders an RNG draw, alters a float accumulation or mis-sizes a pooled
 * buffer would silently regrow every shared link differently. These goldens
 * pin the output of the real pipeline, in Node, with no WebGL.
 *
 * IF THIS SUITE FAILS: either the change is a bug (fix it), or it is an
 * intentional visual change. An intentional change must update the goldens
 * below AND say so in the PR description ("existing share links now grow a
 * different crystal"). Nothing else may touch these values.
 *
 * What a fingerprint is: sha256 (node:crypto, first 16 hex chars) of
 *   arm=<armCount>
 *   branch=<branchCount>
 *   core=<position[3], rotation[3], scale[3], dist, depth>
 *   delays[<length>]=<every delay, in returned order>
 *   matrices[<length>]=<every matrix cell, in returned order>
 * joined by "\n", where every number is `Math.round(v * 1e4)` printed as a
 * plain integer joined by ",". Canonicalisation choices, so the value is stable:
 *  - numbers are quantised to 1e-4 BEFORE printing; no float text is hashed;
 *  - `String(-0)` is "0", so -0 and 0 hash the same after rounding;
 *  - NaN / +-Infinity throw (a broken flake must fail loudly, not hash);
 *  - array lengths are hashed, so a mis-sized scratch subarray is caught.
 *
 * Determinism: every step is an IEEE-754 double operation (JS never fuses
 * multiply-add), Float32Array stores round-to-nearest-even, and the only
 * transcendental calls (Math.sin/cos of constants) go through V8's own fdlibm
 * port, so results are bit-identical across CPUs and Node versions.
 *
 * What it does and does not catch, on purpose:
 *  - The 1e-4 quantisation is the tolerance. A reordered RNG draw, a changed
 *    branching constant that flips any spawn decision, or a mis-sized buffer
 *    moves values by far more than that and fails. Drift far below 1e-4 (e.g.
 *    re-associating float maths, ~1e-7) is invisible to any renderer and
 *    usually passes, but can flip a hash by chance when some value happens to
 *    straddle a rounding boundary. The SVG hash covers many more rounded
 *    coordinates, so it is the more sensitive detector of such drift. If a
 *    benign change trips the suite that way, regenerate the goldens and say so.
 *  - The fingerprint covers matrices/delays in the order `buildSnowflake`
 *    returns them. Ties in delay (every side-branch pair has one) are ordered
 *    by the current quicksort, so swapping the sort for a stable one changes
 *    the hash even though the render looks the same; update the goldens.
 *
 * Every test builds its flake fresh and fingerprints it immediately, so the
 * suite does not depend on test order (see the reverse-order test).
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildSnowflake, type BuildResult } from '../../src/snowflake/geometry.ts';
import {
  getHabit,
  sampleConditions,
  type GrowthConditions,
  type Habit,
} from '../../src/snowflake/nakaya.ts';
import { dailySeed, hashString, mulberry32, Rand } from '../../src/snowflake/random.ts';
import { buildSnowflakeSvg } from '../../src/snowflake/svg-export.ts';

function quantise(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot fingerprint a non-finite value (${value})`);
  }
  return Math.round(value * 1e4);
}

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function fingerprintFlake(result: BuildResult): string {
  const { core } = result;
  const list = (values: ArrayLike<number>): string =>
    Array.from(values, quantise).join(',');
  return digest(
    [
      `arm=${result.armCount}`,
      `branch=${result.branchCount}`,
      `core=${list([
        ...core.position,
        ...core.rotation,
        ...core.scale,
        core.dist,
        core.depth,
      ])}`,
      `delays[${result.delays.length}]=${list(result.delays)}`,
      `matrices[${result.matrices.length}]=${list(result.matrices)}`,
    ].join('\n'),
  );
}

/** What `grow()` in main.ts does for a share link: seed label -> flake. */
function growSeed(label: string): {
  conditions: GrowthConditions;
  result: BuildResult;
} {
  const rand = new Rand(mulberry32(hashString(label)));
  const conditions = sampleConditions(rand);
  return { conditions, result: buildSnowflake(conditions, rand) };
}

/** What a manual Lab edit does: `commitNakayaConditions` shape, seeded rand. */
function growLab(label: string, temperatureC: number, supersaturation: number): BuildResult {
  const rand = new Rand(mulberry32(hashString(label)));
  const conditions: GrowthConditions = {
    temperatureC,
    supersaturation,
    habit: getHabit(temperatureC, supersaturation),
    path: [{ temp: temperatureC, ss: supersaturation }],
  };
  return buildSnowflake(conditions, rand);
}

// Labels are 3, 5, 6, 9 and 12 characters long and, between them, sample all seven habits.
// `d20260925` is the fixed Today's-crystal label for local 2026-09-25, not the clock date.
const SEED_GOLDENS: ReadonlyArray<{
  label: string;
  habit: Habit;
  armCount: number;
  branchCount: number;
  fingerprint: string;
}> = [
  { label: 'abcde', habit: 'fernlike_dendrite', armCount: 50, branchCount: 301, fingerprint: 'd06c34b3af2418a9' },
  { label: 'xyz', habit: 'needle', armCount: 4, branchCount: 25, fingerprint: 'd43b843a338228c6' },
  { label: 'a1b', habit: 'capped_column', armCount: 2, branchCount: 13, fingerprint: '6110e7efb018b173' },
  { label: 'snowflake-12', habit: 'stellar_dendrite', armCount: 34, branchCount: 205, fingerprint: 'f21938606467dab3' },
  { label: '00000', habit: 'plate', armCount: 3, branchCount: 19, fingerprint: '3926df039f039ad9' },
  { label: 'winter', habit: 'sector_plate', armCount: 9, branchCount: 55, fingerprint: 'a04c0981b6fc1e0c' },
  { label: '9z9z9', habit: 'column', armCount: 1, branchCount: 7, fingerprint: '9a975ec9438401ba' },
  { label: 'zx9k2', habit: 'fernlike_dendrite', armCount: 76, branchCount: 457, fingerprint: '5157b5124e65d9b2' },
  // Fixed local date (2026-09-25), never "today", so this golden does not move at midnight.
  { label: 'd20260925', habit: 'fernlike_dendrite', armCount: 32, branchCount: 193, fingerprint: '0407276d02332f0a' },
];

// Manual Lab conditions (single-point path), all grown from seed "abcde".
const LAB_GOLDENS: ReadonlyArray<{
  name: string;
  temperatureC: number;
  supersaturation: number;
  habit: Habit;
  armCount: number;
  branchCount: number;
  fingerprint: string;
}> = [
  { name: 'plate', temperatureC: -2, supersaturation: 0.3, habit: 'plate', armCount: 3, branchCount: 19, fingerprint: '27a73e012ed86d51' },
  { name: 'column', temperatureC: -6, supersaturation: 0.1, habit: 'column', armCount: 1, branchCount: 7, fingerprint: '5f2bf5388e736c9f' },
  { name: 'needle', temperatureC: -5, supersaturation: 0.6, habit: 'needle', armCount: 4, branchCount: 25, fingerprint: '1a9e69c1ee516c76' },
  { name: 'stellar dendrite', temperatureC: -15, supersaturation: 0.6, habit: 'stellar_dendrite', armCount: 40, branchCount: 241, fingerprint: 'c62f6b20130e9061' },
  { name: 'fernlike dendrite', temperatureC: -15, supersaturation: 0.9, habit: 'fernlike_dendrite', armCount: 48, branchCount: 289, fingerprint: 'a0f856dccaf026a9' },
];

const LAB_SEED = 'abcde';

describe('fingerprintFlake', () => {
  function synthetic(overrides: Partial<BuildResult> = {}): BuildResult {
    return {
      armCount: 1,
      branchCount: 7,
      delays: new Float32Array([0.5]),
      matrices: new Float32Array(96).fill(0.25),
      core: {
        position: [0, 0, 0],
        rotation: [1.5, 0, 0.5],
        scale: [0.4, 0.2, 0.4],
        dist: 0,
        depth: 0,
      },
      ...overrides,
    };
  }

  it('quantises to 1e-4 and treats -0 like 0', () => {
    const base = synthetic();
    const noisy = synthetic({
      delays: new Float32Array([0.500004]),
      matrices: new Float32Array(96).fill(0.250004),
    });
    expect(fingerprintFlake(noisy)).toBe(fingerprintFlake(base));

    const zeros = synthetic({ matrices: new Float32Array(96) });
    const negativeZeros = synthetic({ matrices: new Float32Array(96).fill(-0.00004) });
    expect(fingerprintFlake(negativeZeros)).toBe(fingerprintFlake(zeros));
  });

  it('notices a 1e-3 change in a delay, a matrix cell, the core or a count', () => {
    const base = fingerprintFlake(synthetic());
    const nudgedMatrices = new Float32Array(96).fill(0.25);
    nudgedMatrices[41] += 0.001;
    const variants: BuildResult[] = [
      synthetic({ delays: new Float32Array([0.501]) }),
      synthetic({ matrices: nudgedMatrices }),
      synthetic({
        core: { ...synthetic().core, scale: [0.401, 0.2, 0.4] },
      }),
      synthetic({ branchCount: 8 }),
    ];
    for (const variant of variants) {
      expect(fingerprintFlake(variant)).not.toBe(base);
    }
  });

  it('refuses to hash NaN or Infinity', () => {
    expect(() =>
      fingerprintFlake(synthetic({ delays: new Float32Array([Number.NaN]) })),
    ).toThrow(/non-finite/);
    expect(() =>
      fingerprintFlake(synthetic({ matrices: new Float32Array(96).fill(Infinity) })),
    ).toThrow(/non-finite/);
  });
});

describe('golden crystals from seed labels', () => {
  it('pins today\'s crystal to the fixed label d20260925, not the clock date', () => {
    expect(dailySeed(new Date(2026, 8, 25))).toBe('d20260925');
    expect(SEED_GOLDENS.some((golden) => golden.label === 'd20260925')).toBe(true);
  });

  it.each(SEED_GOLDENS)('seed "$label" still grows the same crystal', (golden) => {
    const { conditions, result } = growSeed(golden.label);
    expect(conditions.habit).toBe(golden.habit);
    expect(result.armCount).toBe(golden.armCount);
    expect(result.branchCount).toBe(golden.branchCount);
    expect(result.delays.length).toBe(golden.armCount);
    expect(result.matrices.length).toBe(golden.armCount * 96);
    expect(fingerprintFlake(result)).toBe(golden.fingerprint);
  });
});

describe('golden crystals from manual Lab conditions', () => {
  it.each(LAB_GOLDENS)('$name (T=$temperatureC, SS=$supersaturation) still grows the same crystal', (golden) => {
    expect(getHabit(golden.temperatureC, golden.supersaturation)).toBe(golden.habit);
    const result = growLab(LAB_SEED, golden.temperatureC, golden.supersaturation);
    expect(result.armCount).toBe(golden.armCount);
    expect(result.branchCount).toBe(golden.branchCount);
    expect(result.delays.length).toBe(golden.armCount);
    expect(result.matrices.length).toBe(golden.armCount * 96);
    expect(fingerprintFlake(result)).toBe(golden.fingerprint);
  });
});

describe('build order and shared scratch buffers', () => {
  it('grows the same crystals when the table is built in reverse order', () => {
    // buildSnowflake reuses module-level scratch buffers, LUTs and pooled
    // params; nothing built earlier may leak into what is built later.
    const seen = new Map<string, string>();
    for (const golden of [...LAB_GOLDENS].reverse()) {
      const result = growLab(LAB_SEED, golden.temperatureC, golden.supersaturation);
      seen.set(`lab:${golden.name}`, fingerprintFlake(result));
    }
    for (const golden of [...SEED_GOLDENS].reverse()) {
      seen.set(`seed:${golden.label}`, fingerprintFlake(growSeed(golden.label).result));
    }
    for (const golden of SEED_GOLDENS) {
      expect(seen.get(`seed:${golden.label}`)).toBe(golden.fingerprint);
    }
    for (const golden of LAB_GOLDENS) {
      expect(seen.get(`lab:${golden.name}`)).toBe(golden.fingerprint);
    }
  });

  it('keeps a copied flake intact while the next build reuses the scratch buffers', () => {
    // KNOWN CONTRACT: `matrices` and `delays` are subarray VIEWS into shared
    // module-level scratch buffers, and every buildSnowflake() call rewrites
    // them. The BuildResult of seed A is therefore INVALIDATED by building
    // seed B: fingerprinting A's original result afterwards does not give A's
    // fingerprint any more. Callers must copy before the next build, exactly
    // as `saveSnowflake3d` in main.ts does (slice both arrays, keep `core`).
    // This test pins that contract in both directions: the copy survives, and
    // the original does not, so nobody starts relying on the views staying valid.
    const a = SEED_GOLDENS[0];
    const b = SEED_GOLDENS[3];
    const original = growSeed(a.label).result;
    const fingerprintOfA = fingerprintFlake(original);
    expect(fingerprintOfA).toBe(a.fingerprint);

    const copy: BuildResult = {
      armCount: original.armCount,
      delays: original.delays.slice(),
      matrices: original.matrices.slice(),
      branchCount: original.branchCount,
      core: original.core,
    };

    const next = growSeed(b.label).result;
    expect(fingerprintFlake(next)).toBe(b.fingerprint);

    expect(fingerprintFlake(copy)).toBe(fingerprintOfA);
    expect(fingerprintFlake(original)).not.toBe(fingerprintOfA);
  });
});

describe('golden SVG export', () => {
  it('still exports the same laser-cutter SVG for a seed', () => {
    const label = 'abcde';
    const { conditions, result } = growSeed(label);
    const svg = buildSnowflakeSvg(result, { habit: conditions.habit, seed: label });

    // Readable pieces first (a diff points at what moved), then the whole file.
    const svgTag = svg.split('\n')[1];
    const polygons = svg.match(/<polygon /g)?.length ?? 0;
    expect(svgTag).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4.2386 -4.1463 8.4773 8.2926" width="100mm" height="97.8211mm">',
    );
    expect(polygons).toBe(301); // one hull per instance (armCount * 6) + the core
    expect(digest(svg)).toBe('56106ffe95744cf3');
  });
});
