import { createNoise4D } from "simplex-noise";
import { mulberry32 } from "./random";

export const FROST_SIZE = 256;
const OCTAVES = 5;
const NORMAL_STRENGTH = 2.5;
// 'fros' — stable grain so the surface look does not change across reloads.
export const FROST_SEED = 0x66726f73;

/**
 * Texture repeat (U, V) for both frost maps. Segments are unit prisms stretched per instance, so
 * the world size of a texel depends on the seed: an arm segment is 10 to 30 times longer than a
 * side face is wide (a face spans 1/6 of U, the axis all of V). V therefore wants several times
 * the repeats of U for square grain; 6x lands the area-weighted grain of the five A0 seeds
 * between 0.5 and 2 times square (it was 0.14 to 0.5 at the old (6, 10)). One 256 texel tile is
 * ~1 world unit across, set by the thinnest arms that should still sparkle. The core plate sets
 * its own cap UVs (`segment-geometry.ts`) to match. Pinned by `tests/unit/frost.spec.ts`.
 */
export const FROST_REPEAT: readonly [number, number] = [0.5, 3];

// Glint facets: GLINT_COUNT flat discs of radius GLINT_RADIUS texels scattered over the tile
// (wrapping, so it tiles seamlessly). Big enough to survive mip-mapping.
export const GLINT_COUNT = 480;
const GLINT_RADIUS = 2.4;
// Tangent-space tilt of a facet normal: |xy| in [GLINT_TILT_MIN, GLINT_TILT_MAX] of a unit normal.
const GLINT_TILT_MIN = 0.7;
const GLINT_TILT_MAX = 0.97;
/** Facet roughness map value; the material roughness 0.28 multiplies on, so ~0.13 (the frost is 0.1 to 0.24). */
const GLINT_ROUGHNESS = 0.45;
// LITE static sparkle: a facet is "static" when its baked tilt-x channel (a stand-in for a random
// draw) is between these, so only the brightest few facets sparkle. `glint.ts` re-exports them.
export const GLINT_STATIC_FROM = 0.85;
export const GLINT_STATIC_TO = 0.97;
// Independent stream so the frost grain above is unchanged by facet tuning.
const GLINT_SEED = FROST_SEED ^ 0x9e3779b9;

function fbm(
  noise: (x: number, y: number, z: number, w: number) => number,
  u: number,
  v: number,
): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 3;
  let norm = 0;
  for (let i = 0; i < OCTAVES; i++) {
    const a = u * Math.PI * 2;
    const b = v * Math.PI * 2;
    sum +=
      amp *
      noise(
        Math.cos(a) * freq,
        Math.sin(a) * freq,
        Math.cos(b) * freq,
        Math.sin(b) * freq,
      );
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * Both buffers are RGBA8. `roughnessData` green is roughness (and iridescence thickness). Its
 * other channels are the glint facet field, read by the glint shader on both tiers: red/blue =
 * facet tilt xy (0.5 = flat), alpha = facet coverage (0 off the facets). The same facets are
 * also baked into `normalData` and the roughness green.
 *
 * `normalData` alpha is the LITE static-glint mask: coverage of the static facets only (0 off
 * them). It is its own channel because a mask thresholded on a mip-filtered tilt channel dies
 * where the texture is minified (a thin arm shows a whole tile in a few pixels): the box-filtered
 * mask just becomes the fraction of static facet in the pixel, which the shader scales.
 */
export interface FrostBuffers {
  roughnessData: Uint8Array;
  normalData: Uint8Array;
}

interface GlintFacet {
  cx: number;
  cy: number;
  tx: number;
  ty: number;
  /** 0..1: how much of the LITE static sparkle this facet takes part in (0 or 1 but for a soft ramp). */
  staticWeight: number;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function glintFacets(): GlintFacet[] {
  const rand = mulberry32(GLINT_SEED);
  const facets: GlintFacet[] = [];
  for (let i = 0; i < GLINT_COUNT; i++) {
    const azimuth = rand() * Math.PI * 2;
    const tilt = GLINT_TILT_MIN + rand() * (GLINT_TILT_MAX - GLINT_TILT_MIN);
    facets.push({
      cx: rand() * FROST_SIZE,
      cy: rand() * FROST_SIZE,
      tx: Math.cos(azimuth) * tilt,
      ty: Math.sin(azimuth) * tilt,
      staticWeight: smoothstep(GLINT_STATIC_FROM, GLINT_STATIC_TO, (Math.cos(azimuth) * tilt) * 0.5 + 0.5),
    });
  }
  return facets;
}

/** CPU-only frost map bake; safe to run in a Worker. */
export function generateFrostBuffers(): FrostBuffers {
  const noise = createNoise4D(mulberry32(FROST_SEED));
  const height = new Float32Array(FROST_SIZE * FROST_SIZE);

  for (let y = 0; y < FROST_SIZE; y++) {
    const v = y / FROST_SIZE;
    for (let x = 0; x < FROST_SIZE; x++) {
      const n = fbm(noise, x / FROST_SIZE, v);
      height[y * FROST_SIZE + x] = n * 0.5 + 0.5;
    }
  }

  const roughnessData = new Uint8Array(FROST_SIZE * FROST_SIZE * 4);
  const normalData = new Uint8Array(FROST_SIZE * FROST_SIZE * 4);

  const wrap = (i: number) => ((i % FROST_SIZE) + FROST_SIZE) % FROST_SIZE;

  for (let y = 0; y < FROST_SIZE; y++) {
    for (let x = 0; x < FROST_SIZE; x++) {
      const i = y * FROST_SIZE + x;
      const h = height[i];
      const frost = h * h;
      const roughness = 0.35 + frost * 0.5;

      const o = i * 4;
      const g = Math.round(roughness * 255);
      // Red/blue/alpha are the glint field (neutral here, see FrostBuffers); facets are stamped in below.
      roughnessData[o] = 128;
      roughnessData[o + 1] = g;
      roughnessData[o + 2] = 128;
      roughnessData[o + 3] = 0;

      const dx =
        height[y * FROST_SIZE + wrap(x + 1)] - height[y * FROST_SIZE + wrap(x - 1)];
      const dy =
        height[wrap(y + 1) * FROST_SIZE + x] - height[wrap(y - 1) * FROST_SIZE + x];
      const nx = -dx * NORMAL_STRENGTH;
      const ny = -dy * NORMAL_STRENGTH;
      const nz = 1;
      const invLen = 1 / Math.hypot(nx, ny, nz);

      normalData[o] = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      normalData[o + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      normalData[o + 2] = Math.round((nz * invLen * 0.5 + 0.5) * 255);
      normalData[o + 3] = 0; // static glint mask, see FrostBuffers
    }
  }

  for (const f of glintFacets()) {
    const x0 = Math.floor(f.cx - GLINT_RADIUS - 1);
    const y0 = Math.floor(f.cy - GLINT_RADIUS - 1);
    const reach = Math.ceil(GLINT_RADIUS) + 2;
    for (let y = y0; y < y0 + reach * 2; y++) {
      for (let x = x0; x < x0 + reach * 2; x++) {
        // Texel centre distance; coverage fades over the outer texel so the disc is not aliased.
        const d = Math.hypot(x + 0.5 - f.cx, y + 0.5 - f.cy);
        const cover = Math.min(1, Math.max(0, GLINT_RADIUS + 0.5 - d));
        if (cover < 0.02) continue;
        const o = (wrap(y) * FROST_SIZE + wrap(x)) * 4;

        // Facets are flat: past half coverage a texel takes the facet outright. A blended rim
        // would sweep every normal and light up as a thin ring under the real lights.
        const flat = cover >= 0.5 ? 1 : 0;

        // Roughness green: sharpen towards the facet roughness.
        const g = roughnessData[o + 1];
        const sharp = flat ? Math.round(GLINT_ROUGHNESS * 255) : g;
        // Full tilt at every covered texel (alpha carries the edge): a tilt that fades with
        // coverage would sweep every angle on the rim and light it as a ring.
        roughnessData[o] = Math.round((f.tx * 0.5 + 0.5) * 255);
        roughnessData[o + 1] = sharp;
        roughnessData[o + 2] = Math.round((f.ty * 0.5 + 0.5) * 255);
        roughnessData[o + 3] = Math.round(cover * 255);

        // Normal: the frost normal, or the facet normal where flat.
        const fz = Math.sqrt(1 - f.tx * f.tx - f.ty * f.ty);
        const bx = (normalData[o] / 255) * 2 - 1;
        const by = (normalData[o + 1] / 255) * 2 - 1;
        const bz = (normalData[o + 2] / 255) * 2 - 1;
        const mx = bx + (f.tx - bx) * flat;
        const my = by + (f.ty - by) * flat;
        const mz = bz + (fz - bz) * flat;
        const inv = 1 / Math.hypot(mx, my, mz);
        normalData[o] = Math.round((mx * inv * 0.5 + 0.5) * 255);
        normalData[o + 1] = Math.round((my * inv * 0.5 + 0.5) * 255);
        normalData[o + 2] = Math.round((mz * inv * 0.5 + 0.5) * 255);
        normalData[o + 3] = Math.max(normalData[o + 3], Math.round(cover * f.staticWeight * 255));
      }
    }
  }

  return { roughnessData, normalData };
}
