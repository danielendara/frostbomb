import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { Rand } from './random.ts';
import { getHabit, GrowthConditions, Habit } from './nakaya.ts';

/**
 * Generates a single arm of the snowflake (a 2D branching pattern in the
 * XY plane, with a tiny bit of Z thickness for 3D). Then we rotate-copy it
 * 6 times for true hexagonal symmetry — just like real ice Ih crystallography.
 *
 * The branching parameters (length, width, branch probability, branch angle)
 * are derived from the growth conditions, so colder+wetter → more fern-like,
 * warmer+drier → plainer geometry.
 */

interface Segment {
  dirX: number;
  dirY: number;
  length: number;
  thickness: number;
  thicknessVariation: number;
  midX: number;
  midY: number;
  delay: number;
}

export interface InstanceData {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  dist: number;
  depth: number;
}

export interface BuildResult {
  armCount: number;
  delays: Float32Array;
  matrices: Float32Array;
  branchCount: number;
  core: InstanceData;
}

// Optimization constants
const INV_MAX_DIST = 1 / 3.5;
const INV_SIDE_BRANCH_STEP = 1 / 0.35;

// Pre-calculate symmetry angles once to avoid per-snowflake overhead.
const SYMMETRY_COSINES = new Float32Array(6);
const SYMMETRY_SINES = new Float32Array(6);
for (let i = 0; i < 6; i++) {
  const angle = (i * Math.PI * 2) / 6;
  SYMMETRY_COSINES[i] = Math.cos(angle);
  SYMMETRY_SINES[i] = Math.sin(angle);
}

export function buildSnowflake(
  conditions: GrowthConditions,
  rand: Rand,
): BuildResult {
  const segments: Segment[] = [];
  const noise2D = createNoise2D(() => rand.next());
  const path = conditions.path.length > 0
    ? conditions.path
    : [{ temp: conditions.temperatureC, ss: conditions.supersaturation }];

  // Pre-calculate parameters for the entire atmospheric path to avoid thousands
  // of redundant getHabit() and switch-case executions during recursion.
  const pathParams = path.map((p) => paramsFor(p.temp, p.ss));

  // Build one primary arm along +X
  buildArm(
    segments,
    0, 0, // startX, startY
    1, 0, // dirX, dirY
    0, // dist
    3.5, // Total target length
    0, // depth
    pathParams,
    rand,
    noise2D,
  );

  // Optimization: Sort segments by pre-calculated growth delay. This allows the
  // render loop to break early once it reaches segments that haven't started growing yet.
  segments.sort((a, b) => a.delay - b.delay);

  // Pre-calculate animation delays and matrices directly from segments to avoid O(N) object allocations
  const armLen = segments.length;
  const delays = new Float32Array(armLen);
  const matrices = new Float32Array(armLen * 6 * 16);

  const armStride = armLen * 16;
  for (let j = 0; j < armLen; j++) {
    const seg = segments[j];
    delays[j] = seg.delay;

    // Inline transformation logic from segmentsToInstanceData
    const length = seg.length;
    const finalThickness = seg.thickness * seg.thicknessVariation;

    // Add subtle jitter for organic feel
    const jitter = 0.015;
    const vVar = seg.thicknessVariation - 1;

    // Manual matrix construction for base arm (i=0) incorporating jitter and rotation.
    // Optimization: Avoids THREE.Object3D.updateMatrix() overhead and redundant trig.
    const ax = vVar * 0.1;
    const cax = Math.cos(ax);
    const sax = Math.sin(ax);
    const cbz = -seg.dirY; // cos(angle + PI/2)
    const sbz = seg.dirX;  // sin(angle + PI/2)

    const sx = finalThickness;
    const sy = length;
    const sz = finalThickness;

    const m0 = cbz * sx;
    const m1 = sbz * sx;
    const m4 = -sbz * cax * sy;
    const m5 = cbz * cax * sy;
    const m6 = sax * sy;
    const m8 = sbz * sax * sz;
    const m9 = -cbz * sax * sz;
    const m10 = cax * sz;
    const vJitter = vVar * jitter;
    const m12 = seg.midX + vJitter;
    const m13 = seg.midY + vJitter;
    const m14 = vJitter;

    // Apply rotation for each of the 6 symmetry instances
    // Optimization: Use additive stride-based indexing to avoid multiplications.
    let offset = j * 16;
    for (let i = 0; i < 6; i++) {
      const ci = SYMMETRY_COSINES[i];
      const si = SYMMETRY_SINES[i];

      // Pre-multiply matrix by Z-rotation: M' = Rz(theta_i) * M
      // Formula reduces to identity for i=0 where ci=1, si=0.
      matrices[offset + 0] = ci * m0 - si * m1;
      matrices[offset + 1] = si * m0 + ci * m1;
      matrices[offset + 2] = 0;
      matrices[offset + 3] = 0;
      matrices[offset + 4] = ci * m4 - si * m5;
      matrices[offset + 5] = si * m4 + ci * m5;
      matrices[offset + 6] = m6;
      matrices[offset + 7] = 0;
      matrices[offset + 8] = ci * m8 - si * m9;
      matrices[offset + 9] = si * m8 + ci * m9;
      matrices[offset + 10] = m10;
      matrices[offset + 11] = 0;
      matrices[offset + 12] = ci * m12 - si * m13;
      matrices[offset + 13] = si * m12 + ci * m13;
      matrices[offset + 14] = m14;
      matrices[offset + 15] = 1;
      offset += armStride;
    }
  }

  // Core parameters from start of path
  const startParams = paramsFor(path[0].temp, path[0].ss);

  // Add a solid hexagonal core
  const coreRadius = Math.max(0.2, startParams.primaryThickness * 2.5);
  const zDepthScale = getZDepthScale(startParams.habit);
  const coreHeight = startParams.primaryThickness * zDepthScale * 1.2;

  const core: InstanceData = {
    position: [0, 0, 0],
    rotation: [Math.PI / 2, 0, Math.PI / 6], // Lay flat and align with arms
    scale: [coreRadius * 2, coreHeight, coreRadius * 2],
    dist: 0,
    depth: 0,
  };

  return {
    armCount: armLen,
    delays,
    matrices,
    branchCount: armLen * 6 + 1,
    core,
  };
}

function getZDepthScale(habit: Habit): number {
  return habit === 'column' || habit === 'needle'
    ? 2.5
    : habit === 'capped_column'
      ? 1.8
      : 1.0;
}

interface Params {
  primaryLength: number;
  primaryThickness: number;
  sideBranchProb: number;
  sideBranchDecay: number;
  sideBranchAngle: number;
  maxDepth: number;
  habit: Habit;
  hasRidges: boolean;
  hasTip: boolean;
}

function paramsFor(temp: number, ss: number): Params {
  const habit = getHabit(temp, ss);
  switch (habit) {
    case 'fernlike_dendrite':
      return {
        primaryLength: 3.04,
        primaryThickness: 0.036,
        sideBranchProb: 0.85,
        sideBranchDecay: 0.68,
        sideBranchAngle: Math.PI / 3,
        maxDepth: 4,
        habit,
        hasRidges: true,
        hasTip: true,
      };
    case 'stellar_dendrite':
      return {
        primaryLength: 2.8,
        primaryThickness: 0.048,
        sideBranchProb: 0.55 + ss * 0.25,
        sideBranchDecay: 0.6,
        sideBranchAngle: Math.PI / 3,
        maxDepth: 3,
        habit,
        hasRidges: true,
        hasTip: true,
      };
    case 'sector_plate':
      return {
        primaryLength: 2.08,
        primaryThickness: 0.176,
        sideBranchProb: 0.15,
        sideBranchDecay: 0.4,
        sideBranchAngle: Math.PI / 3,
        maxDepth: 2,
        habit,
        hasRidges: true,
        hasTip: false,
      };
    case 'plate':
      return {
        primaryLength: 1.76,
        primaryThickness: 0.28,
        sideBranchProb: 0.05,
        sideBranchDecay: 0.3,
        sideBranchAngle: Math.PI / 3,
        maxDepth: 1,
        habit,
        hasRidges: false,
        hasTip: false,
      };
    case 'needle':
      return {
        primaryLength: 3.36,
        primaryThickness: 0.04,
        sideBranchProb: 0.05,
        sideBranchDecay: 0.3,
        sideBranchAngle: Math.PI / 4,
        maxDepth: 1,
        habit,
        hasRidges: false,
        hasTip: true,
      };
    case 'column':
      return {
        primaryLength: 1.92,
        primaryThickness: 0.4,
        sideBranchProb: 0,
        sideBranchDecay: 0,
        sideBranchAngle: 0,
        maxDepth: 0,
        habit,
        hasRidges: false,
        hasTip: false,
      };
    case 'capped_column':
      return {
        primaryLength: 2.24,
        primaryThickness: 0.144,
        sideBranchProb: 0.3,
        sideBranchDecay: 0.5,
        sideBranchAngle: Math.PI / 3,
        maxDepth: 2,
        habit,
        hasRidges: true,
        hasTip: true,
      };
    default:
      return {
        primaryLength: 1.76,
        primaryThickness: 0.28,
        sideBranchProb: 0.05,
        sideBranchDecay: 0.3,
        sideBranchAngle: Math.PI / 3,
        maxDepth: 1,
        habit: 'plate',
        hasRidges: false,
        hasTip: false,
      };
  }
}

function buildArm(
  segments: Segment[],
  startX: number,
  startY: number,
  dirX: number,
  dirY: number,
  dist: number,
  length: number,
  depth: number,
  pathParams: Params[],
  rand: Rand,
  noise2D: (x: number, y: number) => number,
) {
  // Sample parameters from the pre-calculated path based on distance from core
  const pathIdx = Math.min(
    pathParams.length - 1,
    (dist * INV_MAX_DIST * pathParams.length) | 0,
  );
  const params = pathParams[pathIdx];

  if (depth > params.maxDepth || length < 0.08) return;

  const endX = startX + dirX * length;
  const endY = startY + dirY * length;
  const midX = (startX + endX) * 0.5;
  const midY = (startY + endY) * 0.5;
  const thicknessVariation = 1 + noise2D(midX * 3, midY * 3) * 0.15;

  segments.push({
    dirX,
    dirY,
    length,
    thickness: params.primaryThickness,
    thicknessVariation,
    midX,
    midY,
    delay: dist * 0.15 + depth * 0.1,
  });

  if (depth >= params.maxDepth) return;

  // Walk along the main branch, occasionally spawning side branches
  const numSteps = (length * INV_SIDE_BRANCH_STEP) | 0;

  for (let i = 1; i < numSteps; i++) {
    const t = i / numSteps;
    // Side branches get less likely near the tip
    const localProb = params.sideBranchProb * (1 - t * 0.4);
    if (!rand.chance(localProb)) continue;

    const tLen = t * length;
    const pointX = startX + dirX * tLen;
    const pointY = startY + dirY * tLen;
    const sideLen = length * params.sideBranchDecay * rand.range(0.4, 1.0) * (1 - t * 0.5);

    // Real snowflakes: side branches grow at 60° (hexagonal lattice)
    const noiseVal = noise2D(pointX * 2, pointY * 2);
    const angleVariation = noiseVal * 0.1;
    const branchAngle = params.sideBranchAngle + angleVariation + rand.range(-0.04, 0.04);
    const cosA = Math.cos(branchAngle);
    const sinA = Math.sin(branchAngle);
    const sideDist = dist + tLen;

    const dxca = dirX * cosA;
    const dysa = dirY * sinA;
    const dxsa = dirX * sinA;
    const dyca = dirY * cosA;

    // Right side branch (sign = 1)
    buildArm(
      segments,
      pointX,
      pointY,
      dxca - dysa,
      dxsa + dyca,
      sideDist,
      sideLen,
      depth + 1,
      pathParams,
      rand,
      noise2D,
    );

    // Left side branch (sign = -1)
    // cos(-a) = cos(a), sin(-a) = -sin(a)
    buildArm(
      segments,
      pointX,
      pointY,
      dxca + dysa,
      -dxsa + dyca,
      sideDist,
      sideLen,
      depth + 1,
      pathParams,
      rand,
      noise2D,
    );
  }

  // Optional pointed tip extension
  if (params.hasTip && depth === 0) {
    const tipLen = 0.12;
    const tipEndX = endX + dirX * tipLen;
    const tipEndY = endY + dirY * tipLen;
    const tipMidX = (endX + tipEndX) * 0.5;
    const tipMidY = (endY + tipEndY) * 0.5;
    const tipThicknessVariation = 1 + noise2D(tipMidX * 3, tipMidY * 3) * 0.15;

    const tipDist = length; // dist + length, where dist is 0 for depth 0 primary arm

    segments.push({
      dirX,
      dirY,
      length: tipLen,
      thickness: params.primaryThickness * 0.4,
      thicknessVariation: tipThicknessVariation,
      midX: tipMidX,
      midY: tipMidY,
      delay: tipDist * 0.15 + (depth + 1) * 0.1,
    });
  }
}


// Internal utility functions (maintained for compatibility and internal use)
export function rotateVec(v: THREE.Vector3, angle: number): THREE.Vector3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new THREE.Vector3(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
}

export function rotateZ(v: THREE.Vector3, cos: number, sin: number): THREE.Vector3 {
  return new THREE.Vector3(v.x * cos - v.y * sin, v.x * sin + v.y * cos, v.z);
}
