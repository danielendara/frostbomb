import * as THREE from "three";
import { createNoise4D } from "simplex-noise";
import { mulberry32 } from "./random";

const SIZE = 256;
const OCTAVES = 5;
const NORMAL_STRENGTH = 2.5;
// 'fros' — stable grain so the surface look does not change across reloads.
const FROST_SEED = 0x66726f73;

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

function configureMap(texture: THREE.DataTexture): THREE.DataTexture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Hex-cylinder faces are thin in U and long in V; denser tiling keeps
  // frost as grain instead of a dashed ridge along each arm.
  texture.repeat.set(6, 10);
  texture.anisotropy = 8;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Seamless procedural frost maps for the shared ice material.
 * Roughness (green) and iridescence thickness share one texture;
 * normals are derived from the same height field.
 */
export function createFrostMaps(): {
  roughnessMap: THREE.DataTexture;
  normalMap: THREE.DataTexture;
} {
  const noise = createNoise4D(mulberry32(FROST_SEED));
  const height = new Float32Array(SIZE * SIZE);

  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const n = fbm(noise, x / SIZE, v);
      height[y * SIZE + x] = n * 0.5 + 0.5;
    }
  }

  const roughnessData = new Uint8Array(SIZE * SIZE * 4);
  const normalData = new Uint8Array(SIZE * SIZE * 4);

  const wrap = (i: number) => ((i % SIZE) + SIZE) % SIZE;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const h = height[i];
      // Keep most of the facet glassy; raise roughness only on frost peaks.
      const frost = h * h;
      const roughness = 0.35 + frost * 0.5;

      const o = i * 4;
      const g = Math.round(roughness * 255);
      roughnessData[o] = g;
      roughnessData[o + 1] = g;
      roughnessData[o + 2] = g;
      roughnessData[o + 3] = 255;

      const dx = height[y * SIZE + wrap(x + 1)] - height[y * SIZE + wrap(x - 1)];
      const dy = height[wrap(y + 1) * SIZE + x] - height[wrap(y - 1) * SIZE + x];
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

  const roughnessMap = configureMap(
    new THREE.DataTexture(roughnessData, SIZE, SIZE, THREE.RGBAFormat),
  );
  const normalMap = configureMap(
    new THREE.DataTexture(normalData, SIZE, SIZE, THREE.RGBAFormat),
  );

  return { roughnessMap, normalMap };
}
