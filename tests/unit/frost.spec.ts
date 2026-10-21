import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildSnowflake } from "../../src/snowflake/geometry.ts";
import { sampleConditions } from "../../src/snowflake/nakaya.ts";
import { hashString, mulberry32, Rand } from "../../src/snowflake/random.ts";
import {
  FROST_REPEAT,
  FROST_SEED,
  FROST_SIZE,
  GLINT_COUNT,
  generateFrostBuffers,
} from "../../src/snowflake/frost-data.ts";
import {
  createCorePlateGeometry,
  createSegmentGeometry,
} from "../../src/snowflake/segment-geometry.ts";

describe("generateFrostBuffers", () => {
  it("is deterministic for the fixed frost seed", () => {
    const first = generateFrostBuffers();
    const second = generateFrostBuffers();
    expect(first.roughnessData).toEqual(second.roughnessData);
    expect(first.normalData).toEqual(second.normalData);
  });

  it("produces full-size RGBA frost maps", () => {
    const { roughnessData, normalData } = generateFrostBuffers();
    expect(roughnessData.length).toBe(FROST_SIZE * FROST_SIZE * 4);
    expect(normalData.length).toBe(FROST_SIZE * FROST_SIZE * 4);
    expect(FROST_SEED).toBe(0x66726f73);
  });
});

describe("glint facets in the frost bake", () => {
  const { roughnessData, normalData } = generateFrostBuffers();
  const texels = FROST_SIZE * FROST_SIZE;
  const covered: number[] = [];
  for (let i = 0; i < texels; i++) if (roughnessData[i * 4 + 3] > 127) covered.push(i);

  it("bakes sparse facets: a few percent to a fifth of the texels", () => {
    expect(GLINT_COUNT).toBeGreaterThan(100);
    expect(covered.length / texels).toBeGreaterThan(0.05);
    expect(covered.length / texels).toBeLessThan(0.2);
  });

  it("leaves the surface neutral off the facets: flat tilt, no coverage", () => {
    let off = 0;
    for (let i = 0; i < texels; i++) {
      if (roughnessData[i * 4 + 3] !== 0) continue;
      off++;
      expect(roughnessData[i * 4]).toBe(128);
      expect(roughnessData[i * 4 + 2]).toBe(128);
    }
    expect(off).toBeGreaterThan(texels * 0.7);
  });

  it("makes facets flat: one tilt, sharper roughness, and a tilted unit normal", () => {
    // The facet interiors share a tilt; check a few well inside a facet.
    const roughness = (i: number) => roughnessData[i * 4 + 1];
    for (const i of covered.filter((_, k) => k % 97 === 0)) {
      expect(roughnessData[i * 4 + 3]).toBeGreaterThanOrEqual(128);
      // Facets are rougher than a mirror and smoother than the frost peaks.
      expect(roughness(i)).toBeGreaterThan(80);
      expect(roughness(i)).toBeLessThan(160);

      const nx = (normalData[i * 4] / 255) * 2 - 1;
      const ny = (normalData[i * 4 + 1] / 255) * 2 - 1;
      const nz = (normalData[i * 4 + 2] / 255) * 2 - 1;
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 1);
      // Tilted well away from flat (|xy| 0.7 to 0.97 of a unit normal).
      expect(nz).toBeLessThan(0.8);
      // The tilt the shader reads (red/blue) matches the baked normal's direction.
      const tx = (roughnessData[i * 4] / 255) * 2 - 1;
      const ty = (roughnessData[i * 4 + 2] / 255) * 2 - 1;
      expect(Math.hypot(tx, ty)).toBeGreaterThan(0.65);
      expect(Math.hypot(tx, ty)).toBeLessThan(1);
      expect(Math.sign(tx) * Math.sign(nx)).toBeGreaterThanOrEqual(0);
      expect(Math.sign(ty) * Math.sign(ny)).toBeGreaterThanOrEqual(0);
    }
  });

  it("wraps: facets cross the tile edge so the repeat has no seam", () => {
    let leftEdge = 0;
    let rightEdge = 0;
    let topEdge = 0;
    let bottomEdge = 0;
    for (let k = 0; k < FROST_SIZE; k++) {
      if (roughnessData[(k * FROST_SIZE) * 4 + 3] > 127) leftEdge++;
      if (roughnessData[(k * FROST_SIZE + FROST_SIZE - 1) * 4 + 3] > 127) rightEdge++;
      if (roughnessData[k * 4 + 3] > 127) topEdge++;
      if (roughnessData[((FROST_SIZE - 1) * FROST_SIZE + k) * 4 + 3] > 127) bottomEdge++;
    }
    // An unwrapped bake leaves one side of each pair empty.
    for (const edge of [leftEdge, rightEdge, topEdge, bottomEdge]) expect(edge).toBeGreaterThan(0);
  });
});

/**
 * Area-weighted median, over the triangles of `geometry` as placed by each of `scales`, of
 * (world length of one UV unit along U) / (along V) once `repeat` is applied: 1 is square grain.
 * Area-weighted because screen area is: a few long arms outweigh many short stubs.
 */
function grainRatio(
  geometry: THREE.BufferGeometry,
  scales: THREE.Matrix3[],
  repeat: readonly [number, number],
  only?: (normal: THREE.Vector3) => boolean,
): number {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const nrm = geometry.getAttribute("normal") as THREE.BufferAttribute;
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  const index = geometry.getIndex()!;
  const items: Array<[number, number]> = [];
  for (const scale of scales) {
    for (let t = 0; t < index.count; t += 3) {
      const ids = [0, 1, 2].map((k) => index.getX(t + k));
      if (only && !only(new THREE.Vector3().fromBufferAttribute(nrm, ids[0]))) continue;
      const p = ids.map((i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix3(scale));
      const u = ids.map((i) => [uv.getX(i) * repeat[0], uv.getY(i) * repeat[1]]);
      const e1 = p[1].clone().sub(p[0]);
      const e2 = p[2].clone().sub(p[0]);
      const d1 = [u[1][0] - u[0][0], u[1][1] - u[0][1]];
      const d2 = [u[2][0] - u[0][0], u[2][1] - u[0][1]];
      const det = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(det) < 1e-9) continue;
      const tu = e1.clone().multiplyScalar(d2[1]).addScaledVector(e2, -d1[1]).divideScalar(det);
      const tv = e2.clone().multiplyScalar(d1[0]).addScaledVector(e1, -d2[0]).divideScalar(det);
      items.push([e1.clone().cross(e2).length() / 2, Math.log(tu.length() / tv.length())]);
    }
  }
  items.sort((a, b) => a[1] - b[1]);
  const total = items.reduce((sum, [w]) => sum + w, 0);
  let acc = 0;
  for (const [w, v] of items) {
    acc += w;
    if (acc >= total / 2) return Math.exp(v);
  }
  return NaN;
}

const A0_SEEDS = ["fox", "nov", "charlie", "alpha", "whisky"];

function grow(seed: string) {
  const rand = new Rand(mulberry32(hashString(seed)));
  return buildSnowflake(sampleConditions(rand), rand);
}

function segmentGrain(seed: string, repeat: readonly [number, number]): number {
  const flake = grow(seed);
  const placements: THREE.Matrix3[] = [];
  for (let i = 0; i < flake.matrices.length / 16; i++) {
    placements.push(
      new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().fromArray(flake.matrices, i * 16)),
    );
  }
  return grainRatio(createSegmentGeometry(), placements, repeat);
}

describe("frost map tiling on the plate segments", () => {
  it.each(A0_SEEDS)("gives %s's segments near-square frost grain", (seed) => {
    const grain = segmentGrain(seed, FROST_REPEAT);
    expect(grain).toBeGreaterThan(0.45);
    expect(grain).toBeLessThan(2.2);
  });

  it("is a retune: the old (6, 10) repeat is far from square on the thinnest arms", () => {
    expect(segmentGrain("alpha", [6, 10])).toBeLessThan(0.2);
    expect(segmentGrain("alpha", FROST_REPEAT)).toBeGreaterThan(0.45);
  });

  it.each(A0_SEEDS)("gives %s's core caps square frost grain", (seed) => {
    const [x, y, z] = grow(seed).core.scale;
    const caps = grainRatio(
      createCorePlateGeometry(),
      [new THREE.Matrix3().set(x, 0, 0, 0, y, 0, 0, 0, z)],
      FROST_REPEAT,
      (n) => Math.abs(n.y) > 0.99,
    );
    expect(caps).toBeGreaterThan(0.85);
    expect(caps).toBeLessThan(1.18);
  });
});
