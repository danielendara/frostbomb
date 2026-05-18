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

// Performance Optimization: Flat buffer for segments to eliminate thousands of O(N) object allocations
// per snowflake generation. This drastically reduces GC pressure and improves memory locality.
const MAX_SEGMENTS_PER_ARM = 10000;
const SEGMENT_STRIDE = 8;
const SEGMENT_BUFFER = new Float32Array(MAX_SEGMENTS_PER_ARM * SEGMENT_STRIDE);
const SEGMENT_INDICES = new Uint32Array(MAX_SEGMENTS_PER_ARM);
let currentSegmentCount = 0;

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
  currentSegmentCount = 0;
  const noise2D = createNoise2D(() => rand.next());

  // Pre-calculate parameters for the entire atmospheric path to avoid thousands
  // of redundant getHabit() and switch-case executions during recursion.
  const pathParams = conditions.path.map((p) => paramsFor(p.temp, p.ss));

  // Build one primary arm along +X
  buildArm(
    0, 0, // startX, startY
    1, 0, // dirX, dirY
    0, // dist
    3.5, // Total target length
    0, // depth
    pathParams,
    rand,
    noise2D,
  );

  // Optimization: Sort segment indices by pre-calculated growth delay. This allows the
  // render loop to break early once it reaches segments that haven't started growing yet.
  // We use a Float32Array-backed index list to avoid object property access overhead during sort.
  const armLen = currentSegmentCount;
  const sortedIndices = SEGMENT_INDICES.subarray(0, armLen);
  sortedIndices.sort((a, b) => SEGMENT_BUFFER[a * SEGMENT_STRIDE + 7] - SEGMENT_BUFFER[b * SEGMENT_STRIDE + 7]);

  // Pre-calculate animation delays and matrices directly from segments to avoid O(N) object allocations
  const delays = new Float32Array(armLen);
  const matrices = new Float32Array(armLen * 6 * 16);

  const stride = armLen * 16;
  for (let j = 0; j < armLen; j++) {
    const segIdx = sortedIndices[j] * SEGMENT_STRIDE;

    const dirX = SEGMENT_BUFFER[segIdx + 0];
    const dirY = SEGMENT_BUFFER[segIdx + 1];
    const length = SEGMENT_BUFFER[segIdx + 2];
    const thickness = SEGMENT_BUFFER[segIdx + 3];
    const thicknessVariation = SEGMENT_BUFFER[segIdx + 4];
    const midX = SEGMENT_BUFFER[segIdx + 5];
    const midY = SEGMENT_BUFFER[segIdx + 6];
    const delay = SEGMENT_BUFFER[segIdx + 7];

    delays[j] = delay;

    // Inline transformation logic from segmentsToInstanceData
    const finalThickness = thickness * thicknessVariation;

    // Add subtle jitter for organic feel
    const jitter = 0.015;
    const vVar = thicknessVariation - 1;

    // Manual matrix construction for base arm (i=0) incorporating jitter and rotation.
    // Optimization: Avoids THREE.Object3D.updateMatrix() overhead and redundant trig.
    const ax = vVar * 0.1;
    // Performance Optimization: 2nd-order Taylor expansion for jitter (small angles).
    // sin(x) ≈ x, cos(x) ≈ 1 - x^2/2. Avoids expensive Math.sin/cos calls.
    const sax = ax;
    const cax = 1 - 0.5 * ax * ax;
    const cbz = -dirY; // cos(angle + PI/2)
    const sbz = dirX;  // sin(angle + PI/2)

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
    const m12 = midX + vJitter;
    const m13 = midY + vJitter;
    const m14 = vJitter;

    // Apply rotation for each of the 6 symmetry instances
    // Optimization: Use additive stride-based indexing to avoid multiplications.
    let offset = j * 16;

    // Special case for i=0 to avoid 48 multiplications and 24 additions/subtractions.
    matrices[offset + 0] = m0;
    matrices[offset + 1] = m1;
    matrices[offset + 2] = 0;
    matrices[offset + 3] = 0;
    matrices[offset + 4] = m4;
    matrices[offset + 5] = m5;
    matrices[offset + 6] = m6;
    matrices[offset + 7] = 0;
    matrices[offset + 8] = m8;
    matrices[offset + 9] = m9;
    matrices[offset + 10] = m10;
    matrices[offset + 11] = 0;
    matrices[offset + 12] = m12;
    matrices[offset + 13] = m13;
    matrices[offset + 14] = m14;
    matrices[offset + 15] = 1;

    offset += stride;

    for (let i = 1; i < 6; i++) {
      const ci = SYMMETRY_COSINES[i];
      const si = SYMMETRY_SINES[i];

      // Pre-multiply matrix by Z-rotation: M' = Rz(theta_i) * M
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
      offset += stride;
    }
  }

  // Core parameters from start of path
  const startParams = pathParams[0];

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
  if (currentSegmentCount >= MAX_SEGMENTS_PER_ARM) return;

  const endX = startX + dirX * length;
  const endY = startY + dirY * length;
  const midX = (startX + endX) * 0.5;
  const midY = (startY + endY) * 0.5;
  const thicknessVariation = 1 + noise2D(midX * 3, midY * 3) * 0.15;

  const bIdx = currentSegmentCount * SEGMENT_STRIDE;
  SEGMENT_BUFFER[bIdx + 0] = dirX;
  SEGMENT_BUFFER[bIdx + 1] = dirY;
  SEGMENT_BUFFER[bIdx + 2] = length;
  SEGMENT_BUFFER[bIdx + 3] = params.primaryThickness;
  SEGMENT_BUFFER[bIdx + 4] = thicknessVariation;
  SEGMENT_BUFFER[bIdx + 5] = midX;
  SEGMENT_BUFFER[bIdx + 6] = midY;
  SEGMENT_BUFFER[bIdx + 7] = dist * 0.15 + depth * 0.1; // delay

  SEGMENT_INDICES[currentSegmentCount] = currentSegmentCount;
  currentSegmentCount++;

  if (depth >= params.maxDepth || params.sideBranchProb <= 0) return;

  // Walk along the main branch, occasionally spawning side branches
  const numSteps = (length * INV_SIDE_BRANCH_STEP) | 0;
  if (numSteps <= 1) return;

  const invNumSteps = 1 / numSteps;
  const stepX = dirX * length * invNumSteps;
  const stepY = dirY * length * invNumSteps;
  const sideLenBase = length * params.sideBranchDecay;
  let pointX = startX;
  let pointY = startY;

  for (let i = 1; i < numSteps; i++) {
    pointX += stepX;
    pointY += stepY;

    const t = i * invNumSteps;
    // Side branches get less likely near the tip
    const localProb = params.sideBranchProb * (1 - t * 0.4);
    if (!rand.chance(localProb)) continue;

    const sideLen = sideLenBase * rand.range(0.4, 1.0) * (1 - t * 0.5);

    // Real snowflakes: side branches grow at 60° (hexagonal lattice)
    const noiseVal = noise2D(pointX * 2, pointY * 2);
    const angleVariation = noiseVal * 0.1;
    const branchAngle = params.sideBranchAngle + angleVariation + rand.range(-0.04, 0.04);
    const cosA = Math.cos(branchAngle);
    const sinA = Math.sin(branchAngle);
    const sideDist = dist + t * length;

    const dxca = dirX * cosA;
    const dysa = dirY * sinA;
    const dxsa = dirX * sinA;
    const dyca = dirY * cosA;

    // Right side branch (sign = 1)
    buildArm(
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
    if (currentSegmentCount >= MAX_SEGMENTS_PER_ARM) return;

    const tipLen = 0.12;
    const tipEndX = endX + dirX * tipLen;
    const tipEndY = endY + dirY * tipLen;
    const tipMidX = (endX + tipEndX) * 0.5;
    const tipMidY = (endY + tipEndY) * 0.5;
    const tipThicknessVariation = 1 + noise2D(tipMidX * 3, tipMidY * 3) * 0.15;

    const tipDist = length; // dist + length, where dist is 0 for depth 0 primary arm

    const tIdx = currentSegmentCount * SEGMENT_STRIDE;
    SEGMENT_BUFFER[tIdx + 0] = dirX;
    SEGMENT_BUFFER[tIdx + 1] = dirY;
    SEGMENT_BUFFER[tIdx + 2] = tipLen;
    SEGMENT_BUFFER[tIdx + 3] = params.primaryThickness * 0.4;
    SEGMENT_BUFFER[tIdx + 4] = tipThicknessVariation;
    SEGMENT_BUFFER[tIdx + 5] = tipMidX;
    SEGMENT_BUFFER[tIdx + 6] = tipMidY;
    SEGMENT_BUFFER[tIdx + 7] = tipDist * 0.15 + (depth + 1) * 0.1;

    SEGMENT_INDICES[currentSegmentCount] = currentSegmentCount;
    currentSegmentCount++;
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
