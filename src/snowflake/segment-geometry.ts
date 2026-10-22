import * as THREE from "three";

/**
 * Render-side meshes for the crystal. `buildSnowflake` is untouched: every segment instance
 * still arrives as a matrix that maps local Y onto the segment, local X onto its width and
 * local Z onto the flake's world Z (with at most ~1° of shear). Local Z is therefore the
 * thin axis of the plate.
 *
 * Both meshes are closed, convex hex prisms built from flat-shaded facets: a hexagonal
 * cross-section extruded along local Y, with each end chamfered, so the faces catch light
 * separately. The segment's hexagon is squashed in Z (a ridge along the middle of each
 * broad face, a short rim wall); the core's is regular, so it reads as a hexagonal plate.
 */

interface PrismSpec {
  /** Cross-section half-width along X (the old tube's flats sat at 0.433, kept for the silhouette). */
  halfWidth: number;
  /** Cross-section half-height along Z at X = 0 (the ridge line). */
  ridge: number;
  /** Cross-section half-height along Z at the X = ±halfWidth rim. */
  shoulder: number;
  /** Axial length of each end chamfer (the prism spans Y = ±0.5). */
  bevelLength: number;
  /** Cross-section scale at the very end of the prism (1 = no chamfer). */
  bevelScale: number;
  /** Multiplier on the planar end-cap UVs (x + 0.5, z + 0.5), see `FROST_REPEAT`. */
  capUvScale: [number, number];
}

const SEGMENT_SPEC: PrismSpec = {
  halfWidth: 0.433,
  ridge: 0.2,
  shoulder: 0.05,
  bevelLength: 0.06,
  bevelScale: 0.8,
  capUvScale: [1, 1],
};

/** Regular hexagon (corners at X = 0, Z = ±0.5), the thin axis being local Y. */
const CORE_SPEC: PrismSpec = {
  halfWidth: 0.433,
  ridge: 0.5,
  shoulder: 0.25,
  bevelLength: 0.12,
  bevelScale: 0.88,
  // `core.scale` makes a cap ~1.4 world units across (fox, nov). With FROST_REPEAT (0.5, 3) these
  // multipliers give it square grain (~0.7 tiles per world unit both ways).
  capUvScale: [1.9, 0.32],
};

/**
 * Euler order for the core mesh. The core's `rotation` of [π/2, 0, π/6] is meant to lay the
 * disc flat and turn its corners toward the arms; with three's default "XYZ" order the Z turn
 * is applied before the X turn and tips the disc 30° out of the flake plane. "ZXY" lays it
 * flat first, then spins it about world Z.
 */
export const CORE_EULER_ORDER: THREE.EulerOrder = "ZXY";

type Vec3 = [number, number, number];
interface Vertex {
  p: Vec3;
  uv: [number, number];
}

function ring(spec: PrismSpec, y: number, scale: number): Vec3[] {
  const { halfWidth: w, ridge: r, shoulder: s } = spec;
  const section: Array<[number, number]> = [
    [0, r],
    [w, s],
    [w, -s],
    [0, -r],
    [-w, -s],
    [-w, s],
  ];
  return section.map(([x, z]) => [x * scale, y, z * scale]);
}

function buildPrism(spec: PrismSpec): THREE.BufferGeometry {
  const { bevelLength, bevelScale, capUvScale } = spec;
  const rings = [
    ring(spec, -0.5, bevelScale),
    ring(spec, -0.5 + bevelLength, 1),
    ring(spec, 0.5 - bevelLength, 1),
    ring(spec, 0.5, bevelScale),
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  /** One flat face (convex polygon). Wound outward: the prism is convex and centred on the origin. */
  const face = (verts: Vertex[]) => {
    const [a, b, c] = verts.map((v) => new THREE.Vector3(...v.p));
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const centre = new THREE.Vector3();
    for (const v of verts) centre.add(new THREE.Vector3(...v.p));
    if (n.dot(centre) < 0) {
      verts = [...verts].reverse();
      n.negate();
    }
    n.normalize();

    const base = positions.length / 3;
    for (const v of verts) {
      positions.push(...v.p);
      normals.push(n.x, n.y, n.z);
      uvs.push(...v.uv);
    }
    for (let i = 1; i < verts.length - 1; i++) indices.push(base, base + i, base + i + 1);
  };

  // Side faces: u runs around the section (i/6), v along the axis (y + 0.5), as on the old tube.
  for (let k = 0; k < rings.length - 1; k++) {
    const lo = rings[k];
    const hi = rings[k + 1];
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      face([
        { p: lo[i], uv: [i / 6, lo[i][1] + 0.5] },
        { p: lo[j], uv: [(i + 1) / 6, lo[j][1] + 0.5] },
        { p: hi[j], uv: [(i + 1) / 6, hi[j][1] + 0.5] },
        { p: hi[i], uv: [i / 6, hi[i][1] + 0.5] },
      ]);
    }
  }

  // End caps: planar UVs.
  for (const end of [rings[0], rings[rings.length - 1]]) {
    face(
      end.map((p) => ({
        p,
        uv: [(p[0] + 0.5) * capUvScale[0], (p[2] + 0.5) * capUvScale[1]] as [number, number],
      })),
    );
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeTangents();
  return geom;
}

/**
 * Instance geometry for one crystal segment: a closed, chamfered, ridged flat hex prism,
 * 44 triangles, spanning X ±0.433, Y ±0.5, Z ±0.2 (thin in the flake's Z).
 */
export function createSegmentGeometry(): THREE.BufferGeometry {
  return buildPrism(SEGMENT_SPEC);
}

/**
 * Geometry for the core: a closed, chamfered regular-hex plate (44 triangles) whose thin axis
 * is local Y, the same layout as the cylinder it replaces, so `core.scale` ([2r, height, 2r])
 * and `core.rotation` apply as before. Use {@link CORE_EULER_ORDER} on the mesh.
 */
export function createCorePlateGeometry(): THREE.BufferGeometry {
  return buildPrism(CORE_SPEC);
}
