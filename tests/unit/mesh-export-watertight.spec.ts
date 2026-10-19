// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildSnowflake, type BuildResult } from "../../src/snowflake/geometry.ts";
import { sampleConditions } from "../../src/snowflake/nakaya.ts";
import { hashString, mulberry32, Rand } from "../../src/snowflake/random.ts";
import { exportSnowflakeModels } from "../../src/snowflake/mesh-export.ts";
import {
  createCorePlateGeometry,
  createSegmentGeometry,
} from "../../src/snowflake/segment-geometry.ts";

function grow(label: string): BuildResult {
  const rand = new Rand(mulberry32(hashString(label)));
  return buildSnowflake(sampleConditions(rand), rand);
}

type Tri = [number[], number[], number[]];

/** Binary STL: 80-byte header, u32 count, then 50 bytes per triangle. */
function readStl(buf: ArrayBuffer): Tri[] {
  const view = new DataView(buf);
  const count = view.getUint32(80, true);
  expect(buf.byteLength).toBe(84 + count * 50);
  const tris: Tri[] = [];
  for (let t = 0; t < count; t++) {
    const base = 84 + t * 50 + 12; // skip the facet normal
    const v = (k: number) => [0, 1, 2].map((c) => view.getFloat32(base + k * 12 + c * 4, true));
    tris.push([v(0), v(1), v(2)]);
  }
  return tris;
}

/** GLB with one indexed triangle primitive: positions and indices, unwelded. */
function readGlb(buf: ArrayBuffer): Tri[] {
  const view = new DataView(buf);
  expect(view.getUint32(0, true)).toBe(0x46546c67); // "glTF"
  const jsonLen = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const binStart = 20 + jsonLen + 8;
  const prim = json.meshes[0].primitives[0];
  const read = (accessorIndex: number) => {
    const acc = json.accessors[accessorIndex];
    const bv = json.bufferViews[acc.bufferView];
    return { acc, offset: binStart + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0) };
  };
  const pos = read(prim.attributes.POSITION);
  const idx = read(prim.indices);
  const index = (i: number) =>
    idx.acc.componentType === 5125
      ? view.getUint32(idx.offset + i * 4, true)
      : view.getUint16(idx.offset + i * 2, true);
  const vertex = (i: number) =>
    [0, 1, 2].map((c) => view.getFloat32(pos.offset + i * 12 + c * 4, true));
  const tris: Tri[] = [];
  for (let i = 0; i < idx.acc.count; i += 3) {
    tris.push([vertex(index(i)), vertex(index(i + 1)), vertex(index(i + 2))]);
  }
  return tris;
}

/** Edges used by a triangle group that are not shared by exactly 2 faces (position-welded). */
function nonManifoldEdges(tris: Tri[]): string[] {
  const edges = new Map<string, number>();
  const key = (p: number[]) => p.map((v) => Math.round(v * 1e3)).join(",");
  for (const tri of tris) {
    for (let e = 0; e < 3; e++) {
      const a = key(tri[e]);
      const b = key(tri[(e + 1) % 3]);
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  return [...edges].filter(([, n]) => n !== 2).map(([k]) => k);
}

/** Segments overlap in the merged mesh, so check each instance's own triangles. */
function expectEveryInstanceWatertight(tris: Tri[], result: BuildResult): void {
  const segTris = createSegmentGeometry().getIndex()!.count / 3;
  const coreTris = createCorePlateGeometry().getIndex()!.count / 3;
  const instances = result.matrices.length / 16;
  expect(tris.length).toBe(instances * segTris + coreTris);
  for (let i = 0; i < instances; i++) {
    expect(nonManifoldEdges(tris.slice(i * segTris, (i + 1) * segTris))).toEqual([]);
  }
  expect(nonManifoldEdges(tris.slice(instances * segTris))).toEqual([]);
}

describe("STL/GLB export of the faceted segments", () => {
  for (const label of ["abcde", "a1b", "9z9z9"]) {
    it(`bakes only closed prisms (every edge in 2 faces) for seed ${label}`, async () => {
      const result = grow(label);
      const { stl, glb } = await exportSnowflakeModels(result);
      expectEveryInstanceWatertight(readStl(await stl.arrayBuffer()), result);
      expectEveryInstanceWatertight(readGlb(await glb.arrayBuffer()), result);
    });
  }

  it("scales the longest side to 50 mm", async () => {
    const { stl } = await exportSnowflakeModels(grow("abcde"));
    const max = [0, 0, 0];
    for (const tri of readStl(await stl.arrayBuffer())) {
      for (const p of tri) p.forEach((v, c) => (max[c] = Math.max(max[c], Math.abs(v))));
    }
    expect(Math.max(...max) * 2).toBeLessThanOrEqual(50.01);
    expect(Math.max(...max) * 2).toBeGreaterThan(30);
  });
});
