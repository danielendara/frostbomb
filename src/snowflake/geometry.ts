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
const SEGMENT_STRIDE = 16;
const SEGMENT_BUFFER = new Float32Array(MAX_SEGMENTS_PER_ARM * SEGMENT_STRIDE);
const DELAY_BUFFER = new Float32Array(MAX_SEGMENTS_PER_ARM);
const SEGMENT_INDICES = new Uint32Array(MAX_SEGMENTS_PER_ARM);
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
  const sortedIndices = SEGMENT_INDICES.subarray(0, armLen);
  // Correctness fix: Always reset indices to ensure we only sort the current arm's data.
  for (let i = 0; i < armLen; i++) sortedIndices[i] = i;
  // Performance Optimization: Use a dedicated flat buffer for delay sorting to improve cache locality.
  sortedIndices.sort((a, b) => DELAY_BUFFER[a] - DELAY_BUFFER[b]);

  // Performance Optimization: Use shared scratchpad buffers during calculation to avoid O(N)
  // intermediate allocations. We return a slice (copy) to ensure that the returned data
  // is owned by the caller and not overwritten by subsequent buildSnowflake calls.
  const delays = new Float32Array(armLen);
  // Float32Array is pre-filled with zeros, allowing us to skip multiple writes in the hot loop.
  const matrices = new Float32Array(armLen * 96); // 6 * 16 = 96

  for (let j = 0; j < armLen; j++) {
    const idx = sortedIndices[j];
    const delay = DELAY_BUFFER[idx];
    delays[j] = delay;

    // Performance Optimization: All matrix components and jitter are pre-calculated during the
    // recursive buildArm pass and stored in SEGMENT_BUFFER. This avoids O(N) redundant calculations
    // and memory loads in the final population phase.
    const bIdx = idx << 4; // STRIDE 16
    const m0 = SEGMENT_BUFFER[bIdx + 0];
    const m1 = SEGMENT_BUFFER[bIdx + 1];
    const K = SEGMENT_BUFFER[bIdx + 2];
    const sax = SEGMENT_BUFFER[bIdx + 3];
    const m6 = SEGMENT_BUFFER[bIdx + 4];
    const m10 = SEGMENT_BUFFER[bIdx + 5];
    const m12 = SEGMENT_BUFFER[bIdx + 6];
    const m13 = SEGMENT_BUFFER[bIdx + 7];
    const m14 = SEGMENT_BUFFER[bIdx + 8];

    // Apply rotation for each of the 6 symmetry instances
    // Optimization: Use interleaved layout [seg0_arm0, seg0_arm1, ..., seg0_arm5, seg1_arm0, ...]
    // to improve cache locality and consolidate GPU update ranges.
    let offset = j * 96;

    // Special case for i=0 (Primary Arm)
    matrices[offset + 0] = m0;
    matrices[offset + 1] = m1;
    matrices[offset + 4] = -m1 * K;
    matrices[offset + 5] = m0 * K;
    matrices[offset + 6] = m6;
    matrices[offset + 8] = m1 * sax;
    matrices[offset + 9] = -m0 * sax;
    matrices[offset + 10] = m10;
    matrices[offset + 12] = m12;
    matrices[offset + 13] = m13;
    matrices[offset + 14] = m14;
    matrices[offset + 15] = 1;

    offset += 16;

    // Symmetry copies (i=1 to 5)
    for (let i = 1; i < 6; i++) {
      const ci = SYMMETRY_COSINES[i];
      const si = SYMMETRY_SINES[i];

      const m0_rot = ci * m0 - si * m1;
      const m1_rot = si * m0 + ci * m1;

      matrices[offset + 0] = m0_rot;
      matrices[offset + 1] = m1_rot;
      matrices[offset + 4] = -m1_rot * K;
      matrices[offset + 5] = m0_rot * K;
      matrices[offset + 6] = m6;
      matrices[offset + 8] = m1_rot * sax;
      matrices[offset + 9] = -m0_rot * sax;
      matrices[offset + 10] = m10;
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
  const pIdx = (dist * pathScale) | 0;
  const pathIdx = pIdx > maxPathIdx ? maxPathIdx : pIdx;
  const params = pathParams[pathIdx];

  if (depth > params.maxDepth || length < 0.08) return;
  if (currentSegmentCount >= MAX_SEGMENTS_PER_ARM) return;

  const midX = startX + dirX * length * 0.5;
  const midY = startY + dirY * length * 0.5;
  const thicknessVariation = 1 + noise2D(midX * 3 + nOffset, midY * 3 + nOffset) * 0.15;
  const finalThickness = params.primaryThickness * thicknessVariation;
  const vVar = thicknessVariation - 1;

  // Performance Optimization: Hoist matrix basis calculations and organic jitter from the O(6N)
  // symmetry loop into this O(N) build phase. This reduces calculations by a factor of 6.
  const ax = vVar * 0.1;
  const sax = ax; // sin(ax) approx
  const cax = 1 - 0.5 * ax * ax; // cos(ax) approx
  const sx = finalThickness;
  const sy = length;
  // Use pre-calculated sx, sy, and cax to derive matrix columns.
  const m0 = -dirY * sx;
  const m1 = dirX * sx;
  const K = (cax * sy) / (sx || 0.0001);
  const m6 = sax * sy;
  const m10 = cax * sx; // cax * sz, where sz = sx
  const vJitter = vVar * 0.015; // jitter constant
  const m12 = midX + vJitter;
  const m13 = midY + vJitter;
  const m14 = vJitter;

  const bIdx = currentSegmentCount << 4; // STRIDE 16
  SEGMENT_BUFFER[bIdx + 0] = m0;
  SEGMENT_BUFFER[bIdx + 1] = m1;
  SEGMENT_BUFFER[bIdx + 2] = K;
  SEGMENT_BUFFER[bIdx + 3] = sax;
  SEGMENT_BUFFER[bIdx + 4] = m6;
  SEGMENT_BUFFER[bIdx + 5] = m10;
  SEGMENT_BUFFER[bIdx + 6] = m12;
  SEGMENT_BUFFER[bIdx + 7] = m13;
  SEGMENT_BUFFER[bIdx + 8] = m14;
  DELAY_BUFFER[currentSegmentCount] = dist * 0.15 + depth * 0.1;

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
    const tipFinalThickness = params.primaryThickness * 0.4 * tipThicknessVariation;
    const tipVVar = tipThicknessVariation - 1;

    const tax = tipVVar * 0.1;
    const tsax = tax;
    const tcax = 1 - 0.5 * tax * tax;
    const tsx = tipFinalThickness;
    const tsy = tipLen;

    const tIdx = currentSegmentCount << 4;
    SEGMENT_BUFFER[tIdx + 0] = -dirY * tsx;
    SEGMENT_BUFFER[tIdx + 1] = dirX * tsx;
    SEGMENT_BUFFER[tIdx + 2] = (tcax * tsy) / (tsx || 0.0001);
    SEGMENT_BUFFER[tIdx + 3] = tsax;
    SEGMENT_BUFFER[tIdx + 4] = tsax * tsy;
    SEGMENT_BUFFER[tIdx + 5] = tcax * tsx;
    const tvJitter = tipVVar * 0.015;
    SEGMENT_BUFFER[tIdx + 6] = tipMidX + tvJitter;
    SEGMENT_BUFFER[tIdx + 7] = tipMidY + tvJitter;
    SEGMENT_BUFFER[tIdx + 8] = tvJitter;
    DELAY_BUFFER[currentSegmentCount] = length * 0.15 + (depth + 1) * 0.1;

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
