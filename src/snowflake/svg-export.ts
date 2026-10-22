import type { BuildResult, InstanceData } from "./geometry";

/** Local hex prism vertices (Y axis, radius 0.5, height 1). */
const LOCAL_CYLINDER_VERTS: readonly (readonly [number, number, number])[] =
  (() => {
    const verts: [number, number, number][] = [];
    for (const y of [-0.5, 0.5]) {
      for (let i = 0; i < 6; i++) {
        const theta = (i * Math.PI) / 3;
        verts.push([Math.sin(theta) * 0.5, y, Math.cos(theta) * 0.5]);
      }
    }
    return verts;
  })();

type Point = [number, number];

const COS_PI_6 = Math.sqrt(3) / 2;
const SIN_PI_6 = 0.5;
const PHYSICAL_MM = 100;
const VIEW_PAD = 0.08;

function fmt(n: number): string {
  const rounded = Math.round(n * 1e4) / 1e4;
  if (Object.is(rounded, -0)) return "0";
  return String(rounded);
}

function transformXY(
  m: Float32Array,
  offset: number,
  x: number,
  y: number,
  z: number,
): Point {
  return [
    m[offset] * x + m[offset + 4] * y + m[offset + 8] * z + m[offset + 12],
    -(m[offset + 1] * x + m[offset + 5] * y + m[offset + 9] * z + m[offset + 13]),
  ];
}

/** Column-major 4×4 core instance matrix for SVG projection. */
function coreMatrix(core: InstanceData): Float32Array {
  const sx = core.scale[0];
  const sy = core.scale[1];
  const sz = core.scale[2];
  const m = new Float32Array(16);
  m[0] = COS_PI_6 * sx;
  m[1] = SIN_PI_6 * sx;
  m[4] = 0;
  m[5] = 0;
  m[6] = sy;
  m[8] = SIN_PI_6 * sz;
  m[9] = -COS_PI_6 * sz;
  m[10] = 0;
  m[12] = core.position[0];
  m[13] = core.position[1];
  m[14] = core.position[2];
  m[15] = 1;
  return m;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points.slice();

  const pts = points
    .map((p): Point => [p[0], p[1]])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const lower: Point[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function hullFromMatrix(m: Float32Array, offset: number): Point[] {
  const verts: Point[] = [];
  for (const [x, y, z] of LOCAL_CYLINDER_VERTS) {
    verts.push(transformXY(m, offset, x, y, z));
  }
  return convexHull(verts);
}

function polygonElement(points: Point[]): string | null {
  if (points.length < 3) return null;
  const pts = points.map((p) => `${fmt(p[0])},${fmt(p[1])}`).join(" ");
  return `<polygon points="${pts}"/>`;
}

export interface SvgExportOptions {
  habit: string;
  seed: string;
}

/**
 * Project the instanced hexagonal-cylinder flake into a 2D SVG.
 * Output is sized to 100mm on the long axis for laser/plotter CAM tools.
 */
export function buildSnowflakeSvg(
  data: BuildResult,
  options: SvgExportOptions,
): string {
  const polygons: string[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const absorb = (hull: Point[]) => {
    const el = polygonElement(hull);
    if (!el) return;
    polygons.push(el);
    for (const [x, y] of hull) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  };

  const instanceCount = data.matrices.length / 16;
  for (let i = 0; i < instanceCount; i++) {
    absorb(hullFromMatrix(data.matrices, i << 4));
  }

  absorb(hullFromMatrix(coreMatrix(data.core), 0));

  if (!Number.isFinite(minX)) {
    minX = -1;
    minY = -1;
    maxX = 1;
    maxY = 1;
  }

  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const padX = spanX * VIEW_PAD;
  const padY = spanY * VIEW_PAD;
  const vbX = minX - padX;
  const vbY = minY - padY;
  const vbW = spanX + padX * 2;
  const vbH = spanY + padY * 2;
  const long = Math.max(vbW, vbH);
  const widthMm = (vbW / long) * PHYSICAL_MM;
  const heightMm = (vbH / long) * PHYSICAL_MM;

  const habit = options.habit.replace(/_/g, "-");
  const title = `frostbomb ${habit} (${options.seed})`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(vbX)} ${fmt(vbY)} ${fmt(vbW)} ${fmt(vbH)}" width="${fmt(widthMm)}mm" height="${fmt(heightMm)}mm">
  <title>${title}</title>
  <desc>2D projection of a procedurally grown ice crystal for laser cutting, vinyl plotting, and print. Overlapping filled polygons follow 6-fold hexagonal symmetry.</desc>
  <g fill="#111111" stroke="none" fill-rule="nonzero">
    ${polygons.join("\n    ")}
  </g>
</svg>
`;
}
