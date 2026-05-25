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

// Performance Optimization: Shared buffers to eliminate thousands of O(N) object allocations
// per snowflake generation. This drastically reduces GC pressure and improves memory locality.
const MAX_SEGMENTS_PER_ARM = 10000;
const SEGMENT_STRIDE = 8;
const SEGMENT_BUFFER = new Float32Array(MAX_SEGMENTS_PER_ARM * SEGMENT_STRIDE);
const SORT_BUFFER = new Uint32Array(MAX_SEGMENTS_PER_ARM);
let currentSegmentCount = 0;

// Performance Optimization: Global noise instance avoids building a permutation table every time.
// We use a fixed seed for the internal permutation table to ensure that nOffset-based
// variation remains deterministic across different sessions.
const noise2D = createNoise2D(() => 0.5);

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

  // Use a seeded offset to ensure deterministic but unique noise per snowflake.
  const nOffset = rand.range(0, 1000);

  // Pre-calculate parameters for the entire atmospheric path to avoid thousands
  // of redundant getHabit() and switch-case executions during recursion.
  const pathParams = conditions.path.map((p) => paramsFor(p.temp, p.ss));
  // Optimization: Pre-calculate path sampling scale to save multiplications in recursion.
  const pathScale = INV_MAX_DIST * pathParams.length;

  // Build one primary arm along +X
  const maxPathIdx = pathParams.length - 1;
  buildArm(
    0, 0, // startX, startY
    1, 0, // dirX, dirY
    0, // dist
    3.5, // Total target length
    0, // depth
    pathParams,
    maxPathIdx,
    pathScale,
    rand,
    nOffset,
  );

  // Optimization: Sort segment indices by pre-calculated growth delay. This allows the
  // render loop to break early once it reaches segments that haven't started growing yet.
  const armLen = currentSegmentCount;
  const packedBuffer = SORT_BUFFER.subarray(0, armLen);
  for (let i = 0; i < armLen; i++) {
    const delay = SEGMENT_BUFFER[i * SEGMENT_STRIDE + 7];
    // Performance Optimization: Pack delay (high bits) and index (low bits) into a single 32-bit
    // integer. This enables the use of TypedArray.prototype.sort()'s default numeric sort,
    // which is ~6x faster than a custom comparator by avoiding JIT-to-JS transitions.
    // 14 bits for index (up to 16,384) and 18 bits for delay (up to 26.2 at 10,000x scale).
    packedBuffer[i] = ((delay * 10000) | 0) << 14 | (i & 0x3FFF);
  }
  packedBuffer.sort();

  // Performance Optimization: Use shared scratchpad buffers during calculation to avoid O(N)
  // intermediate allocations. We return a slice (copy) to ensure that the returned data
  // is owned by the caller and not overwritten by subsequent buildSnowflake calls.
  const delays = new Float32Array(armLen);
  const matrices = new Float32Array(armLen * 6 * 16);

  for (let j = 0; j < armLen; j++) {
    const packed = packedBuffer[j];
    const segIdx = (packed & 0x3FFF) * SEGMENT_STRIDE;

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

    // Pre-calculate ratios for rotated columns to save multiplications/subtractions in the loop.
    // Since sx == sz, we can derive rotated Y and Z basis columns from the rotated X column.
    const K = (cax * sy) / (sx || 0.0001);

    const m4 = -m1 * K;
    const m5 = m0 * K;
    const m6 = sax * sy;
    const m8 = m1 * sax;
    const m9 = -m0 * sax;
    const m10 = cax * sz;
    const vJitter = vVar * jitter;
    const m12 = midX + vJitter;
    const m13 = midY + vJitter;
    const m14 = vJitter;

    // Apply rotation for each of the 6 symmetry instances
    // Optimization: Use interleaved layout [seg0_arm0, seg0_arm1, ..., seg0_arm5, seg1_arm0, ...]
    // to improve cache locality and consolidate GPU update ranges.
    let offset = j * 6 * 16;

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

    offset += 16;

    for (let i = 1; i < 6; i++) {
      const ci = SYMMETRY_COSINES[i];
      const si = SYMMETRY_SINES[i];

      const m0_rot = ci * m0 - si * m1;
      const m1_rot = si * m0 + ci * m1;

      matrices[offset + 0] = m0_rot;
      matrices[offset + 1] = m1_rot;
      matrices[offset + 2] = 0;
      matrices[offset + 3] = 0;
      matrices[offset + 4] = -m1_rot * K;
      matrices[offset + 5] = m0_rot * K;
      matrices[offset + 6] = m6;
      matrices[offset + 7] = 0;
      matrices[offset + 8] = m1_rot * sax;
      matrices[offset + 9] = -m0_rot * sax;
      matrices[offset + 10] = m10;
      matrices[offset + 11] = 0;
      matrices[offset + 12] = ci * m12 - si * m13;
      matrices[offset + 13] = si * m12 + ci * m13;
      matrices[offset + 14] = m14;
      matrices[offset + 15] = 1;
      offset += 16;
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
  cosAngle: number;
  sinAngle: number;
  maxDepth: number;
  habit: Habit;
  hasRidges: boolean;
  hasTip: boolean;
}

function paramsFor(temp: number, ss: number): Params {
  const habit = getHabit(temp, ss);
  let p: Omit<Params, 'cosAngle' | 'sinAngle'>;
  switch (habit) {
    case 'fernlike_dendrite':
      p = {
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
      break;
    case 'stellar_dendrite':
      p = {
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
      break;
    case 'sector_plate':
      p = {
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
      break;
    case 'plate':
      p = {
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
      break;
    case 'needle':
      p = {
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
      break;
    case 'column':
      p = {
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
      break;
    case 'capped_column':
      p = {
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
      break;
    default:
      p = {
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
  return {
    ...p,
    cosAngle: Math.cos(p.sideBranchAngle),
    sinAngle: Math.sin(p.sideBranchAngle),
  };
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
  maxPathIdx: number,
  pathScale: number,
  rand: Rand,
  nOffset: number,
) {
  // Sample parameters from the pre-calculated path based on distance from core
  // Optimization: use pre-calculated pathScale and maxPathIdx.
  const pathIdx = Math.min(
    maxPathIdx,
    (dist * pathScale) | 0,
  );
  const params = pathParams[pathIdx];

  if (depth > params.maxDepth || length < 0.08) return;
  if (currentSegmentCount >= MAX_SEGMENTS_PER_ARM) return;

  const midX = startX + dirX * length * 0.5;
  const midY = startY + dirY * length * 0.5;
  const thicknessVariation = 1 + noise2D(midX * 3 + nOffset, midY * 3 + nOffset) * 0.15;

  const bIdx = currentSegmentCount * SEGMENT_STRIDE;
  SEGMENT_BUFFER[bIdx + 0] = dirX;
  SEGMENT_BUFFER[bIdx + 1] = dirY;
  SEGMENT_BUFFER[bIdx + 2] = length;
  SEGMENT_BUFFER[bIdx + 3] = params.primaryThickness;
  SEGMENT_BUFFER[bIdx + 4] = thicknessVariation;
  SEGMENT_BUFFER[bIdx + 5] = midX;
  SEGMENT_BUFFER[bIdx + 6] = midY;
  SEGMENT_BUFFER[bIdx + 7] = dist * 0.15 + depth * 0.1; // delay

  currentSegmentCount++;

  if (depth >= params.maxDepth || params.sideBranchProb <= 0) return;

  // Walk along the main branch, occasionally spawning side branches
  const numSteps = (length * INV_SIDE_BRANCH_STEP) | 0;
  if (numSteps <= 1) return;

  const invNumSteps = 1 / numSteps;
  const stepDist = length * invNumSteps;
  const stepX = dirX * stepDist;
  const stepY = dirY * stepDist;
  const sideLenBase = length * params.sideBranchDecay;
  let pointX = startX;
  let pointY = startY;
  let currentDist = dist;

  // Pre-calculate additive steps for local probability, side length decay, and noise coordinates.
  const probStep = params.sideBranchProb * (invNumSteps * 0.4);
  const lenStep = invNumSteps * 0.5;
  const stepX2 = stepX * 2;
  const stepY2 = stepY * 2;
  let currentLocalProb = params.sideBranchProb * (1 - invNumSteps * 0.4);
  let currentLenFactor = 1 - invNumSteps * 0.5;
  let px2 = (startX + stepX) * 2;
  let py2 = (startY + stepY) * 2;

  for (let i = 1; i < numSteps; i++) {
    pointX += stepX;
    pointY += stepY;
    currentDist += stepDist;

    // Side branches get less likely near the tip
    // Optimization: Additive tracking for localProb decay.
    if (rand.chance(currentLocalProb)) {
      const sideLen = sideLenBase * rand.range(0.4, 1.0) * currentLenFactor;

      // Real snowflakes: side branches grow at 60° (hexagonal lattice)
      // Optimization: Additive tracking for noise coordinates px2/py2.
      const noiseVal = noise2D(px2, py2);

      const angleVariation = noiseVal * 0.1;
    // Optimization: 2nd-order Taylor expansion for side branch angle perturbations.
    // Small angle approx: cos(a+v) ≈ cos(a) - v*sin(a) - 0.5*v^2*cos(a)
    //                     sin(a+v) ≈ sin(a) + v*cos(a) - 0.5*v^2*sin(a)
    const v = angleVariation + rand.range(-0.04, 0.04);
    const v2 = 0.5 * v * v;
    const cosA = params.cosAngle - v * params.sinAngle - v2 * params.cosAngle;
    const sinA = params.sinAngle + v * params.cosAngle - v2 * params.sinAngle;
    const sideDist = currentDist;

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
      maxPathIdx,
      pathScale,
      rand,
      nOffset,
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
      maxPathIdx,
      pathScale,
      rand,
      nOffset,
    );
    }

    currentLocalProb -= probStep;
    currentLenFactor -= lenStep;
    px2 += stepX2;
    py2 += stepY2;
  }

  // Optional pointed tip extension
  if (params.hasTip && depth === 0) {
    if (currentSegmentCount >= MAX_SEGMENTS_PER_ARM) return;

    const tipLen = 0.12;
    const endX = startX + dirX * length;
    const endY = startY + dirY * length;
    const tipMidX = endX + dirX * tipLen * 0.5;
    const tipMidY = endY + dirY * tipLen * 0.5;
    const tipThicknessVariation = 1 + noise2D(tipMidX * 3 + nOffset, tipMidY * 3 + nOffset) * 0.15;

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
