import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildSnowflake, type BuildResult } from "../../src/snowflake/geometry.ts";
import { sampleConditions, type Habit } from "../../src/snowflake/nakaya.ts";
import { hashString, mulberry32, Rand } from "../../src/snowflake/random.ts";
import {
  CORE_EULER_ORDER,
  createCorePlateGeometry,
  createSegmentGeometry,
} from "../../src/snowflake/segment-geometry.ts";

/** Segment-level triangle budget from issue #441 (today's open tube is 12). */
const MAX_TRIANGLES_PER_SEGMENT = 64;

/** Position-welded edge -> number of faces using it. */
function edgeUseCounts(geom: THREE.BufferGeometry): Map<string, number> {
  const pos = geom.getAttribute("position") as THREE.BufferAttribute;
  const index = geom.getIndex();
  if (!index) throw new Error("geometry is not indexed");
  const weld = new Map<string, number>();
  const id = (i: number): number => {
    const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => Math.round(v * 1e5)).join(",");
    let w = weld.get(key);
    if (w === undefined) {
      w = weld.size;
      weld.set(key, w);
    }
    return w;
  };
  const edges = new Map<string, number>();
  for (let t = 0; t < index.count; t += 3) {
    const tri = [id(index.getX(t)), id(index.getX(t + 1)), id(index.getX(t + 2))];
    for (let e = 0; e < 3; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  return edges;
}

function size(geom: THREE.BufferGeometry): THREE.Vector3 {
  geom.computeBoundingBox();
  return geom.boundingBox!.getSize(new THREE.Vector3());
}

function signedVolume(geom: THREE.BufferGeometry): number {
  const pos = geom.getAttribute("position") as THREE.BufferAttribute;
  const index = geom.getIndex()!;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let v = 0;
  for (let t = 0; t < index.count; t += 3) {
    a.fromBufferAttribute(pos, index.getX(t));
    b.fromBufferAttribute(pos, index.getX(t + 1));
    c.fromBufferAttribute(pos, index.getX(t + 2));
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return v;
}

const MESHES = [
  { name: "segment", make: createSegmentGeometry },
  { name: "core plate", make: createCorePlateGeometry },
] as const;

describe.each(MESHES)("$name geometry", ({ make }) => {
  it("is closed: every edge is shared by exactly 2 faces", () => {
    const edges = edgeUseCounts(make());
    expect(edges.size).toBeGreaterThan(0);
    const open = [...edges].filter(([, n]) => n !== 2);
    expect(open).toEqual([]);
  });

  it(`stays within ${MAX_TRIANGLES_PER_SEGMENT} triangles`, () => {
    const tris = make().getIndex()!.count / 3;
    expect(tris).toBeGreaterThan(20); // more than a bare hex prism: it is chamfered
    expect(tris).toBeLessThanOrEqual(MAX_TRIANGLES_PER_SEGMENT);
  });

  it("is wound outward, with matching flat normals", () => {
    const geom = make();
    expect(signedVolume(geom)).toBeGreaterThan(0);
    const pos = geom.getAttribute("position") as THREE.BufferAttribute;
    const nrm = geom.getAttribute("normal") as THREE.BufferAttribute;
    const index = geom.getIndex()!;
    const [a, b, c, n] = [0, 1, 2, 3].map(() => new THREE.Vector3());
    for (let t = 0; t < index.count; t += 3) {
      a.fromBufferAttribute(pos, index.getX(t));
      b.fromBufferAttribute(pos, index.getX(t + 1));
      c.fromBufferAttribute(pos, index.getX(t + 2));
      n.fromBufferAttribute(nrm, index.getX(t));
      const face = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      expect(face.dot(n)).toBeGreaterThan(0.999);
    }
  });

  it("has unit tangents perpendicular to the normals, and UVs in [0, 1]", () => {
    const geom = make();
    const nrm = geom.getAttribute("normal") as THREE.BufferAttribute;
    const tan = geom.getAttribute("tangent") as THREE.BufferAttribute;
    const uv = geom.getAttribute("uv") as THREE.BufferAttribute;
    expect(tan.itemSize).toBe(4);
    expect(tan.count).toBe(nrm.count);
    for (let i = 0; i < tan.count; i++) {
      const t = new THREE.Vector3().fromBufferAttribute(tan, i);
      expect(t.length()).toBeCloseTo(1, 4);
      expect(Math.abs(t.dot(new THREE.Vector3().fromBufferAttribute(nrm, i)))).toBeLessThan(1e-4);
      expect(Math.abs(tan.getW(i))).toBe(1);
      expect(uv.getX(i)).toBeGreaterThanOrEqual(-1e-6);
      expect(uv.getX(i)).toBeLessThanOrEqual(1 + 1e-6);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(-1e-6);
      expect(uv.getY(i)).toBeLessThanOrEqual(1 + 1e-6);
    }
  });
});

describe("segment geometry", () => {
  it("is flat: Z extent is smaller than X extent", () => {
    const s = size(createSegmentGeometry());
    expect(s.z).toBeLessThan(s.x);
    expect(s.z).toBeLessThan(s.x * 0.5);
    expect(s.y).toBeCloseTo(1, 6); // unit length along the segment, as the matrices expect
  });
});

describe("core plate geometry", () => {
  it("is thin along local Y (the old cylinder axis) and hexagonal across", () => {
    const s = size(createCorePlateGeometry());
    expect(s.y).toBeCloseTo(1, 6);
    expect(s.x).toBeCloseTo(0.866, 3);
    expect(s.z).toBeCloseTo(1, 3);
  });
});

function grow(label: string): { habit: Habit; result: BuildResult } {
  const rand = new Rand(mulberry32(hashString(label)));
  const conditions = sampleConditions(rand);
  return { habit: conditions.habit, result: buildSnowflake(conditions, rand) };
}

describe("instance matrices and the flat plate", () => {
  const SEEDS = Array.from({ length: 120 }, (_, i) => `plate-${i}`);

  it("keeps every segment's local Z on world Z, across seeds and all 7 habits", () => {
    const habits = new Set<Habit>();
    const z = new THREE.Vector3();
    let instances = 0;
    for (const label of SEEDS) {
      const { habit, result } = grow(label);
      habits.add(habit);
      for (let o = 0; o < result.matrices.length; o += 16) {
        z.set(result.matrices[o + 8], result.matrices[o + 9], result.matrices[o + 10]).normalize();
        // ~1 degree of shear at most (the sax term in geometry.ts).
        expect(Math.abs(z.z)).toBeGreaterThan(0.999);
        instances++;
      }
    }
    expect(habits.size).toBe(7);
    expect(instances).toBeGreaterThan(1000);
  });

  it("renders each segment thinner in world Z than in its own width", () => {
    const geom = createSegmentGeometry();
    const m = new THREE.Matrix4();
    const box = new THREE.Box3();
    const { result } = grow("fox");
    for (let o = 0; o < result.matrices.length; o += 16) {
      m.fromArray(result.matrices, o);
      box.copy(geom.boundingBox ?? (geom.computeBoundingBox(), geom.boundingBox!)).applyMatrix4(m);
      const sx = Math.hypot(result.matrices[o], result.matrices[o + 1]);
      // Z thickness is the segment half-height times its X scale; X scale is the plate width.
      expect(box.max.z - box.min.z).toBeLessThan(sx);
    }
  });

  it("lays the core plate flat: its thin local Y lands on world Z", () => {
    const geom = createCorePlateGeometry();
    for (const label of SEEDS.slice(0, 40)) {
      const { core } = grow(label).result;
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(core.rotation[0], core.rotation[1], core.rotation[2], CORE_EULER_ORDER),
      );
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      expect(Math.abs(axis.z)).toBeCloseTo(1, 6);
      // Rendered extent: wide in the flake plane, thin in Z.
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(...core.position),
        q,
        new THREE.Vector3(...core.scale),
      );
      geom.computeBoundingBox();
      const s = geom.boundingBox!.clone().applyMatrix4(m).getSize(new THREE.Vector3());
      expect(s.z).toBeLessThan(Math.min(s.x, s.y));
    }
  });
});
