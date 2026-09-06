import { createNoise4D } from "simplex-noise";
import { mulberry32 } from "./random";

export const FROST_SIZE = 256;
const OCTAVES = 5;
const NORMAL_STRENGTH = 2.5;
// 'fros' — stable grain so the surface look does not change across reloads.
export const FROST_SEED = 0x66726f73;

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

export interface FrostBuffers {
  roughnessData: Uint8Array;
  normalData: Uint8Array;
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
      roughnessData[o] = g;
      roughnessData[o + 1] = g;
      roughnessData[o + 2] = g;
      roughnessData[o + 3] = 255;

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
      normalData[o + 3] = 255;
    }
  }

  return { roughnessData, normalData };
}
