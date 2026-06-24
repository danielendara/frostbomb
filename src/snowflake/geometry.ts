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

// Performance Optimization: Pre-calculated inverse steps to avoid division in the recursion loop.
const INV_STEPS_LUT = new Float32Array([
  0, 1, 0.5, 0.33333334, 0.25, 0.2, 0.16666667, 0.14285715, 0.125, 0.11111111, 0.1,
]);
const INV_STEPS_LUT_04 = INV_STEPS_LUT.map((v) => v * 0.4);
const INV_STEPS_LUT_05 = INV_STEPS_LUT.map((v) => v * 0.5);

// Performance Optimization: Shared buffers to eliminate thousands of O(N) object allocations
// per snowflake generation. This drastically reduces GC pressure and improves memory locality.
const MAX_SEGMENTS_PER_ARM = 10000;
const SEGMENT_STRIDE = 16;
const SEGMENT_BUFFER = new Float32Array(MAX_SEGMENTS_PER_ARM * SEGMENT_STRIDE);
const DELAY_BUFFER = new Float32Array(MAX_SEGMENTS_PER_ARM);
const SEGMENT_INDICES = new Uint32Array(MAX_SEGMENTS_PER_ARM);
const IDENTITY_INDICES = new Uint32Array(MAX_SEGMENTS_PER_ARM);
for (let i = 0; i < MAX_SEGMENTS_PER_ARM; i++) {
  IDENTITY_INDICES[i] = i;
}

const MATRICES_BUFFER = new Float32Array(MAX_SEGMENTS_PER_ARM * 96);
for (let i = 0; i < MAX_SEGMENTS_PER_ARM; i++) {
  const o = i * 96;
  MATRICES_BUFFER[o + 15] = 1;
  MATRICES_BUFFER[o + 31] = 1;
  MATRICES_BUFFER[o + 47] = 1;
  MATRICES_BUFFER[o + 63] = 1;
  MATRICES_BUFFER[o + 79] = 1;
  MATRICES_BUFFER[o + 95] = 1;
}
let currentSegmentCount = 0;

/**
 * Performance Optimization: Dedicated sort comparator hoisted to avoid closure re-creation.
 */
function compareDelays(a: number, b: number): number {
  return DELAY_BUFFER[a] - DELAY_BUFFER[b];
}

// Performance Optimization: Global noise instance avoids building a permutation table every time.
// We use a fixed seed for the internal permutation table to ensure that nOffset-based
// variation remains deterministic across different sessions.
const noise2D = createNoise2D(() => 0.5);

// Pre-calculate symmetry constants.
const SIN60 = 0.86602540378;

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
  const maxPathIdx = pathParams.length - 1;

  // Performance Optimization: Capture invariant parameters and the RNG via closure in a local
  // recursive function. This reduces the number of arguments passed in recursion from 12 to 7,
  // minimizing stack frame overhead and property lookups on every call.
  const rng = rand.rng;

  function buildArmInternal(
    startX: number,
    startY: number,
    dirX: number,
    dirY: number,
    dist: number,
    length: number,
    depth: number,
    params: Params,
  ) {
    if (currentSegmentCount >= MAX_SEGMENTS_PER_ARM) return;

    // Performance Optimization: Destructure params once per call to minimize property lookups
    // in the hot recursion path.
    const {
      primaryThickness,
      sideBranchProb,
      sideBranchDecay,
      cosAngle,
      sinAngle,
      maxDepth,
      hasTip,
    } = params;

    const halfLen = length * 0.5;
    const midX = startX + dirX * halfLen;
    const midY = startY + dirY * halfLen;
    const midX3 = midX * 3;
    const midY3 = midY * 3;
    const nx = midX3 + nOffset;
    const ny = midY3 + nOffset;
    const vVar = noise2D(nx, ny) * 0.15;
    const finalThickness = primaryThickness * (1 + vVar);

    // Performance Optimization: Hoist matrix basis calculations and organic jitter from the O(6N)
    // symmetry loop into this O(N) build phase. This reduces calculations by a factor of 6.
    const sax = vVar * 0.1; // sin(ax) approx
    const cax = 1 - 0.5 * sax * sax; // cos(ax) approx
    const sx = finalThickness;
    const sy = length;
    // Use pre-calculated sx, sy, and cax to derive matrix columns.
    const m0 = -dirY * sx;
    const m1 = dirX * sx;
    const caxy = cax * sy;
    const m4 = -dirX * caxy;
    const m5 = -dirY * caxy;
    const sxax = sx * sax;
    const m8 = dirX * sxax;
    const m9 = dirY * sxax;
    const m6 = sax * sy;
    const m10 = cax * sx; // cax * sz, where sz = sx
    const vJitter = vVar * 0.015; // jitter constant
    const m12 = midX + vJitter;
    const m13 = midY + vJitter;
    const m14 = vJitter;

    const bIdx = currentSegmentCount << 4; // STRIDE 16
    SEGMENT_BUFFER[bIdx + 0] = m0;
    SEGMENT_BUFFER[bIdx + 1] = m1;
    SEGMENT_BUFFER[bIdx + 2] = m4;
    SEGMENT_BUFFER[bIdx + 3] = m5;
    SEGMENT_BUFFER[bIdx + 4] = m8;
    SEGMENT_BUFFER[bIdx + 5] = m9;
    SEGMENT_BUFFER[bIdx + 6] = m6;
    SEGMENT_BUFFER[bIdx + 7] = m10;
    SEGMENT_BUFFER[bIdx + 8] = m12;
    SEGMENT_BUFFER[bIdx + 9] = m13;
    SEGMENT_BUFFER[bIdx + 10] = m14;
    DELAY_BUFFER[currentSegmentCount] = dist * 0.15 + depth * 0.1;

    currentSegmentCount++;

    if (depth >= maxDepth || sideBranchProb <= 0) return;

    // Walk along the main branch, occasionally spawning side branches
    const numSteps = (length * INV_SIDE_BRANCH_STEP) | 0;
    if (numSteps <= 1) return;

    const invNumSteps = INV_STEPS_LUT[numSteps] || 1 / numSteps;
    const stepDist = length * invNumSteps;
    const stepX = dirX * stepDist;
    const stepY = dirY * stepDist;
    const sideLenBase = length * sideBranchDecay;
    let pointX = startX;
    let pointY = startY;
    let currentDist = dist;

    // Performance Optimization: Use additive tracking for atmospheric path sampling to avoid
    // multiplications and divisions in the hot loop.
    let pIdxFloat = dist * pathScale;
    const pIdxStep = stepDist * pathScale;

    // Pre-calculate additive steps for local probability, side length decay, and noise coordinates.
    const lut04 = INV_STEPS_LUT_04[numSteps] || invNumSteps * 0.4;
    const probStep = sideBranchProb * lut04;
    const lenStep = INV_STEPS_LUT_05[numSteps] || invNumSteps * 0.5;
    const stepX2 = stepX * 2;
    const stepY2 = stepY * 2;
    let currentLocalProb = sideBranchProb * (1 - lut04);
    let currentLenFactor = 1 - lenStep;
    let px2 = (startX + stepX) * 2;
    let py2 = (startY + stepY) * 2;

    const nextDepth = depth + 1;

    // Hoist side branch length factors to save multiplications.
    const sideLenMin = sideLenBase * 0.4;
    const sideLenRange = sideLenBase * 0.6;

    for (let i = 1; i < numSteps; i++) {
      pointX += stepX;
      pointY += stepY;
      currentDist += stepDist;
      pIdxFloat += pIdxStep;

      // Side branches get less likely near the tip
      // Optimization: Inline rand.chance/range calls to avoid property lookups and method overhead.
      if (rng() < currentLocalProb) {
        const sideLen = (sideLenMin + sideLenRange * rng()) * currentLenFactor;

        // Optimization: Prune side branches early before performing lookups and recursive calls.
        if (sideLen >= 0.08) {
          // Real snowflakes: side branches grow at 60° (hexagonal lattice)
          const noiseVal = noise2D(px2, py2);

          const angleVariation = noiseVal * 0.1;
          // Optimization: 2nd-order Taylor expansion for side branch angle perturbations.
          // Small angle approx: cos(a+v) ≈ cos(a) - v*sin(a) - 0.5*v^2*cos(a)
          //                     sin(a+v) ≈ sin(a) + v*cos(a) - 0.5*v^2*sin(a)
          const v = angleVariation + (-0.04 + 0.08 * rng());
          const v2 = 0.5 * v * v;
          const cosA = cosAngle - v * sinAngle - v2 * cosAngle;
          const sinA = sinAngle + v * cosAngle - v2 * sinAngle;
          // Optimization: Pre-sample parameters for the side branch only when it's created.
          const pIdx = pIdxFloat | 0;
          const pathIdx = pIdx > maxPathIdx ? maxPathIdx : pIdx;
          const nextParams = pathParams[pathIdx];

          if (nextDepth <= nextParams.maxDepth) {
            const dxca = dirX * cosA;
            const dysa = dirY * sinA;
            const dxsa = dirX * sinA;
            const dyca = dirY * cosA;

            // Right side branch (sign = 1)
            buildArmInternal(
              pointX,
              pointY,
              dxca - dysa,
              dxsa + dyca,
              currentDist,
              sideLen,
              nextDepth,
              nextParams,
            );

            // Left side branch (sign = -1)
            // cos(-a) = cos(a), sin(-a) = -sin(a)
            buildArmInternal(
              pointX,
              pointY,
              dxca + dysa,
              -dxsa + dyca,
              currentDist,
              sideLen,
              nextDepth,
              nextParams,
            );
          }
        }
      }

      currentLocalProb -= probStep;
      currentLenFactor -= lenStep;
      px2 += stepX2;
      py2 += stepY2;
    }

    // Optional pointed tip extension
    if (hasTip && depth === 0) {
      if (currentSegmentCount >= MAX_SEGMENTS_PER_ARM) return;

      const tipLen = 0.12;
      const endX = startX + dirX * length;
      const endY = startY + dirY * length;
      const tipMidX = endX + dirX * 0.06; // halfTipLen
      const tipMidY = endY + dirY * 0.06;
      const tipMidX3 = tipMidX * 3;
      const tipMidY3 = tipMidY * 3;
      const tipVVar = noise2D(tipMidX3 + nOffset, tipMidY3 + nOffset) * 0.15;
      const tipVVar01 = tipVVar * 0.1;
      const tcax = 1 - 0.5 * tipVVar01 * tipVVar01;
      const tsx = primaryThickness * 0.4 * (1 + tipVVar);
      const tcaxy = tcax * tipLen;
      const tsxax = tsx * tipVVar01;

      const tIdx = currentSegmentCount << 4;
      SEGMENT_BUFFER[tIdx + 0] = -dirY * tsx;
      SEGMENT_BUFFER[tIdx + 1] = dirX * tsx;
      SEGMENT_BUFFER[tIdx + 2] = -dirX * tcaxy;
      SEGMENT_BUFFER[tIdx + 3] = -dirY * tcaxy;
      SEGMENT_BUFFER[tIdx + 4] = dirX * tsxax;
      SEGMENT_BUFFER[tIdx + 5] = dirY * tsxax;
      SEGMENT_BUFFER[tIdx + 6] = tipVVar01 * tipLen;
      SEGMENT_BUFFER[tIdx + 7] = tcax * tsx;
      const tvJitter = tipVVar * 0.015;
      SEGMENT_BUFFER[tIdx + 8] = tipMidX + tvJitter;
      SEGMENT_BUFFER[tIdx + 9] = tipMidY + tvJitter;
      SEGMENT_BUFFER[tIdx + 10] = tvJitter;
      DELAY_BUFFER[currentSegmentCount] = length * 0.15 + 0.1; // depth=0

      currentSegmentCount++;
    }
  }

  // Build one primary arm along +X
  buildArmInternal(0, 0, 1, 0, 0, 3.5, 0, pathParams[0]);

  // Optimization: Sort segment indices by pre-calculated growth delay. This allows the
  // render loop to break early once it reaches segments that haven't started growing yet.
  const armLen = currentSegmentCount;
  const sortedIndices = SEGMENT_INDICES.subarray(0, armLen);
  // Performance Optimization: Use .set() and a pre-allocated IDENTITY_INDICES buffer to reset indices.
  // This leverages memcpy and is faster than an explicit O(N) for-loop.
  sortedIndices.set(IDENTITY_INDICES.subarray(0, armLen));
  // Performance Optimization: Use a dedicated flat buffer for delay sorting to improve cache locality.
  sortedIndices.sort(compareDelays);

  // Performance Optimization: Use shared scratchpad buffers during calculation to avoid O(N)
  // intermediate allocations. We return a slice (copy) to ensure that the returned data
  // is owned by the caller and not overwritten by subsequent buildSnowflake calls.
  const delays = new Float32Array(armLen);
  // Performance Optimization: Use a shared scratchpad buffer and subarray() to return the result.
  // In this single-threaded, synchronous context, subarray() avoids a multi-megabyte allocation
  // and copy, as the data is consumed or copied by the caller (scene.updateFlake) immediately.
  const matrices = MATRICES_BUFFER.subarray(0, armLen * 96);

  let offset = 0;
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
    const m4 = SEGMENT_BUFFER[bIdx + 2];
    const m5 = SEGMENT_BUFFER[bIdx + 3];
    const m8 = SEGMENT_BUFFER[bIdx + 4];
    const m9 = SEGMENT_BUFFER[bIdx + 5];
    const m6 = SEGMENT_BUFFER[bIdx + 6];
    const m10 = SEGMENT_BUFFER[bIdx + 7];
    const m12 = SEGMENT_BUFFER[bIdx + 8];
    const m13 = SEGMENT_BUFFER[bIdx + 9];
    const m14 = SEGMENT_BUFFER[bIdx + 10];

    // Apply rotation for each of the 6 symmetry instances
    // Optimization: Use interleaved layout [seg0_arm0, seg0_arm1, ..., seg0_arm5, seg1_arm0, ...]
    // to improve cache locality and consolidate GPU update ranges.
    // Performance Optimization: Use hexagonal symmetry identities to unroll the loop
    // and eliminate multiplications.

    // Arm 0 (Primary Arm, 0°)
    matrices[offset + 0] = m0;
    matrices[offset + 1] = m1;
    matrices[offset + 4] = m4;
    matrices[offset + 5] = m5;
    matrices[offset + 6] = m6;
    matrices[offset + 8] = m8;
    matrices[offset + 9] = m9;
    matrices[offset + 10] = m10;
    matrices[offset + 12] = m12;
    matrices[offset + 13] = m13;
    matrices[offset + 14] = m14;

    // Arm 1 (60°)
    const m0_1 = 0.5 * m0 - SIN60 * m1;
    const m1_1 = SIN60 * m0 + 0.5 * m1;
    const m4_1 = 0.5 * m4 - SIN60 * m5;
    const m5_1 = SIN60 * m4 + 0.5 * m5;
    const m8_1 = 0.5 * m8 - SIN60 * m9;
    const m9_1 = SIN60 * m8 + 0.5 * m9;
    const m12_1 = 0.5 * m12 - SIN60 * m13;
    const m13_1 = SIN60 * m12 + 0.5 * m13;

    matrices[offset + 16] = m0_1;
    matrices[offset + 17] = m1_1;
    matrices[offset + 20] = m4_1;
    matrices[offset + 21] = m5_1;
    matrices[offset + 22] = m6;
    matrices[offset + 24] = m8_1;
    matrices[offset + 25] = m9_1;
    matrices[offset + 26] = m10;
    matrices[offset + 28] = m12_1;
    matrices[offset + 29] = m13_1;
    matrices[offset + 30] = m14;

    // Arm 2 (120°) = Arm 1 - Arm 0
    const m0_2 = m0_1 - m0;
    const m1_2 = m1_1 - m1;
    const m4_2 = m4_1 - m4;
    const m5_2 = m5_1 - m5;
    const m8_2 = m8_1 - m8;
    const m9_2 = m9_1 - m9;
    const m12_2 = m12_1 - m12;
    const m13_2 = m13_1 - m13;

    matrices[offset + 32] = m0_2;
    matrices[offset + 33] = m1_2;
    matrices[offset + 36] = m4_2;
    matrices[offset + 37] = m5_2;
    matrices[offset + 38] = m6;
    matrices[offset + 40] = m8_2;
    matrices[offset + 41] = m9_2;
    matrices[offset + 42] = m10;
    matrices[offset + 44] = m12_2;
    matrices[offset + 45] = m13_2;
    matrices[offset + 46] = m14;

    // Arm 3 (180°) = -Arm 0
    const m0_3 = -m0;
    const m1_3 = -m1;
    const m4_3 = -m4;
    const m5_3 = -m5;
    const m8_3 = -m8;
    const m9_3 = -m9;
    const m12_3 = -m12;
    const m13_3 = -m13;

    matrices[offset + 48] = m0_3;
    matrices[offset + 49] = m1_3;
    matrices[offset + 52] = m4_3;
    matrices[offset + 53] = m5_3;
    matrices[offset + 54] = m6;
    matrices[offset + 56] = m8_3;
    matrices[offset + 57] = m9_3;
    matrices[offset + 58] = m10;
    matrices[offset + 60] = m12_3;
    matrices[offset + 61] = m13_3;
    matrices[offset + 62] = m14;

    // Arm 4 (240°) = -Arm 1
    const m0_4 = -m0_1;
    const m1_4 = -m1_1;
    const m4_4 = -m4_1;
    const m5_4 = -m5_1;
    const m8_4 = -m8_1;
    const m9_4 = -m9_1;
    const m12_4 = -m12_1;
    const m13_4 = -m13_1;

    matrices[offset + 64] = m0_4;
    matrices[offset + 65] = m1_4;
    matrices[offset + 68] = m4_4;
    matrices[offset + 69] = m5_4;
    matrices[offset + 70] = m6;
    matrices[offset + 72] = m8_4;
    matrices[offset + 73] = m9_4;
    matrices[offset + 74] = m10;
    matrices[offset + 76] = m12_4;
    matrices[offset + 77] = m13_4;
    matrices[offset + 78] = m14;

    // Arm 5 (300°) = -Arm 2
    const m0_5 = -m0_2;
    const m1_5 = -m1_2;
    const m4_5 = -m4_2;
    const m5_5 = -m5_2;
    const m8_5 = -m8_2;
    const m9_5 = -m9_2;
    const m12_5 = -m12_2;
    const m13_5 = -m13_2;

    matrices[offset + 80] = m0_5;
    matrices[offset + 81] = m1_5;
    matrices[offset + 84] = m4_5;
    matrices[offset + 85] = m5_5;
    matrices[offset + 86] = m6;
    matrices[offset + 88] = m8_5;
    matrices[offset + 89] = m9_5;
    matrices[offset + 90] = m10;
    matrices[offset + 92] = m12_5;
    matrices[offset + 93] = m13_5;
    matrices[offset + 94] = m14;

    offset += 96;
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

// Internal utility functions (maintained for compatibility and internal use)
export function rotateVec(v: THREE.Vector3, angle: number): THREE.Vector3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new THREE.Vector3(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
}

export function rotateZ(v: THREE.Vector3, cos: number, sin: number): THREE.Vector3 {
  return new THREE.Vector3(v.x * cos - v.y * sin, v.x * sin + v.y * cos, v.z);
}
