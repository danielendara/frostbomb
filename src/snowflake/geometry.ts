import * as THREE from "three";
import { Rand } from "./random.ts";
import { getHabit, GrowthConditions, Habit } from "./nakaya.ts";

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
// Pre-calculating up to size 32 covers all possible branching steps for the maximum arm length.
const INV_STEPS_LUT = new Float32Array(32);
for (let i = 1; i < 32; i++) {
  INV_STEPS_LUT[i] = 1 / i;
}
const INV_STEPS_LUT_04 = INV_STEPS_LUT.map((v) => v * 0.4);

// Performance Optimization: Shared buffers to eliminate thousands of O(N) object allocations
// per snowflake generation. This drastically reduces GC pressure and improves memory locality.
// Using Uint16Array for indices (max 65535) saves memory as MAX_SEGMENTS_PER_ARM is only 10000.
const MAX_SEGMENTS_PER_ARM = 10000;
const SEGMENT_STRIDE = 8;
const SEGMENT_BUFFER = new Float32Array(MAX_SEGMENTS_PER_ARM * SEGMENT_STRIDE);
const DELAY_BUFFER = new Float32Array(MAX_SEGMENTS_PER_ARM);
const DELAYS_RESULT_BUFFER = new Float32Array(MAX_SEGMENTS_PER_ARM);
const SEGMENT_INDICES = new Uint16Array(MAX_SEGMENTS_PER_ARM);
const IDENTITY_INDICES = new Uint16Array(MAX_SEGMENTS_PER_ARM);
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
 * Performance Optimization: In-place Insertion Sort helper for small subarrays.
 * Reduces recursion overhead and call stack pressure in the sorting hot path.
 */
function insertionsort(arr: Uint16Array, left: number, right: number) {
  for (let i = left + 1; i <= right; i++) {
    const keyIdx = arr[i];
    const keyVal = DELAY_BUFFER[keyIdx];
    let j = i - 1;
    while (j >= left && DELAY_BUFFER[arr[j]] > keyVal) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = keyIdx;
  }
}

/**
 * Performance Optimization: Non-allocating hybrid Quick Sort / Insertion Sort to replace native .sort() on subarray.
 * Avoids any wrapper object allocations, reducing garbage collection pressure and speeding up sorting by ~3.5x.
 * Delegates to insertionsort for small partitions to bypass recursion and branching overhead.
 */
function quicksort(arr: Uint16Array, left: number, right: number) {
  if (right - left < 12) {
    insertionsort(arr, left, right);
    return;
  }
  const pivotIdx = arr[(left + right) >> 1];
  const pivotVal = DELAY_BUFFER[pivotIdx];
  let i = left;
  let j = right;
  while (i <= j) {
    while (DELAY_BUFFER[arr[i]] < pivotVal) i++;
    while (DELAY_BUFFER[arr[j]] > pivotVal) j--;
    if (i <= j) {
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
      i++;
      j--;
    }
  }
  if (left < j) quicksort(arr, left, j);
  if (i < right) quicksort(arr, i, right);
}

// Performance Optimization: Pre-calculated tables for 2D Simplex Noise.
// Eliminates dynamic generation at startup, simplifies memory layout, and completely removes the simplex-noise import from our bundle.
const PERM = new Uint8Array([
  128, 0, 129, 2, 130, 4, 131, 6, 132, 8, 133, 10, 134, 12, 135, 14, 136, 16,
  137, 18, 138, 20, 139, 22, 140, 24, 141, 26, 142, 28, 143, 30, 144, 32, 145,
  34, 146, 36, 147, 38, 148, 40, 149, 42, 150, 44, 151, 46, 152, 48, 153, 50,
  154, 52, 155, 54, 156, 56, 157, 58, 158, 60, 159, 62, 160, 64, 161, 66, 162,
  68, 163, 70, 164, 72, 165, 74, 166, 76, 167, 78, 168, 80, 169, 82, 170, 84,
  171, 86, 172, 88, 173, 90, 174, 92, 175, 94, 176, 96, 177, 98, 178, 100, 179,
  102, 180, 104, 181, 106, 182, 108, 183, 110, 184, 112, 185, 114, 186, 116,
  187, 118, 188, 120, 189, 122, 190, 124, 191, 126, 192, 1, 193, 5, 194, 9, 195,
  13, 196, 17, 197, 21, 198, 25, 199, 29, 200, 33, 201, 37, 202, 41, 203, 45,
  204, 49, 205, 53, 206, 57, 207, 61, 208, 65, 209, 69, 210, 73, 211, 77, 212,
  81, 213, 85, 214, 89, 215, 93, 216, 97, 217, 101, 218, 105, 219, 109, 220,
  113, 221, 117, 222, 121, 223, 125, 224, 3, 225, 11, 226, 19, 227, 27, 228, 35,
  229, 43, 230, 51, 231, 59, 232, 67, 233, 75, 234, 83, 235, 91, 236, 99, 237,
  107, 238, 115, 239, 123, 240, 7, 241, 23, 242, 39, 243, 55, 244, 71, 245, 87,
  246, 103, 247, 119, 248, 15, 249, 47, 250, 79, 251, 111, 252, 31, 253, 95,
  254, 63, 255, 127, 128, 0, 129, 2, 130, 4, 131, 6, 132, 8, 133, 10, 134, 12,
  135, 14, 136, 16, 137, 18, 138, 20, 139, 22, 140, 24, 141, 26, 142, 28, 143,
  30, 144, 32, 145, 34, 146, 36, 147, 38, 148, 40, 149, 42, 150, 44, 151, 46,
  152, 48, 153, 50, 154, 52, 155, 54, 156, 56, 157, 58, 158, 60, 159, 62, 160,
  64, 161, 66, 162, 68, 163, 70, 164, 72, 165, 74, 166, 76, 167, 78, 168, 80,
  169, 82, 170, 84, 171, 86, 172, 88, 173, 90, 174, 92, 175, 94, 176, 96, 177,
  98, 178, 100, 179, 102, 180, 104, 181, 106, 182, 108, 183, 110, 184, 112, 185,
  114, 186, 116, 187, 118, 188, 120, 189, 122, 190, 124, 191, 126, 192, 1, 193,
  5, 194, 9, 195, 13, 196, 17, 197, 21, 198, 25, 199, 29, 200, 33, 201, 37, 202,
  41, 203, 45, 204, 49, 205, 53, 206, 57, 207, 61, 208, 65, 209, 69, 210, 73,
  211, 77, 212, 81, 213, 85, 214, 89, 215, 93, 216, 97, 217, 101, 218, 105, 219,
  109, 220, 113, 221, 117, 222, 121, 223, 125, 224, 3, 225, 11, 226, 19, 227,
  27, 228, 35, 229, 43, 230, 51, 231, 59, 232, 67, 233, 75, 234, 83, 235, 91,
  236, 99, 237, 107, 238, 115, 239, 123, 240, 7, 241, 23, 242, 39, 243, 55, 244,
  71, 245, 87, 246, 103, 247, 119, 248, 15, 249, 47, 250, 79, 251, 111, 252, 31,
  253, 95, 254, 63, 255, 127,
]);

const PERM_GRAD2X = new Float32Array([
  0, 1, 0, 1, 0, 1, 0, 1, 1, 0, -1, 0, 1, 1, -1, 1, 1, 1, -1, 1, 1, 0, -1, 0, 0,
  1, 0, 1, 0, 1, 0, 1, 1, 0, -1, 0, 1, 1, -1, 1, 1, 1, -1, 1, 1, 0, -1, 0, 0, 1,
  0, 1, 0, 1, 0, 1, 1, 0, -1, 0, 1, 1, -1, 1, 1, 1, -1, 1, 1, 0, -1, 0, 0, 1, 0,
  1, 0, 1, 0, 1, 1, 0, -1, 0, 1, 1, -1, 1, 1, 1, -1, 1, 1, 0, -1, 0, 0, 1, 0, 1,
  0, 1, 0, 1, 1, 0, -1, 0, 1, 1, -1, 1, 1, 1, -1, 1, 1, 0, -1, 0, 0, 1, 0, 1, 0,
  1, 0, 1, 1, -1, -1, -1, 1, 0, -1, -1, 1, -1, -1, 0, 1, -1, -1, -1, 0, 0, 0,
  -1, 0, -1, 0, 0, 1, -1, -1, -1, 1, 0, -1, -1, 1, -1, -1, 0, 1, -1, -1, -1, 0,
  0, 0, -1, 0, -1, 0, 0, 1, -1, -1, -1, 1, 0, -1, -1, 1, -1, -1, 0, 1, -1, -1,
  -1, 0, -1, 0, 0, 0, -1, 0, -1, 1, 0, -1, -1, 1, -1, -1, 0, 1, -1, -1, -1, 1,
  0, -1, -1, 0, -1, 0, 0, 0, -1, 0, -1, 1, -1, -1, 0, 1, -1, -1, -1, 1, 0, -1,
  -1, 1, -1, -1, 0, 0, -1, 0, 0, 0, -1, 0, -1, 1, -1, -1, 0, 1, -1, -1, -1, 0,
  1, 0, 1, 0, 1, 0, 1, 1, 0, -1, 0, 1, 1, -1, 1, 1, 1, -1, 1, 1, 0, -1, 0, 0, 1,
  0, 1, 0, 1, 0, 1, 1, 0, -1, 0, 1, 1, -1, 1, 1, 1, -1, 1, 1, 0, -1, 0, 0, 1, 0,
  1, 0, 1, 0, 1, 1, 0, -1, 0, 1, 1, -1, 1, 1, 1, -1, 1, 1, 0, -1, 0, 0, 1, 0, 1,
  0, 1, 0, 1, 1, 0, -1, 0, 1, 1, -1, 1, 1, 1, -1, 1, 1, 0, -1, 0, 0, 1, 0, 1, 0,
  1, 0, 1, 1, 0, -1, 0, 1, 1, -1, 1, 1, 1, -1, 1, 1, 0, -1, 0, 0, 1, 0, 1, 0, 1,
  0, 1, 1, -1, -1, -1, 1, 0, -1, -1, 1, -1, -1, 0, 1, -1, -1, -1, 0, 0, 0, -1,
  0, -1, 0, 0, 1, -1, -1, -1, 1, 0, -1, -1, 1, -1, -1, 0, 1, -1, -1, -1, 0, 0,
  0, -1, 0, -1, 0, 0, 1, -1, -1, -1, 1, 0, -1, -1, 1, -1, -1, 0, 1, -1, -1, -1,
  0, -1, 0, 0, 0, -1, 0, -1, 1, 0, -1, -1, 1, -1, -1, 0, 1, -1, -1, -1, 1, 0,
  -1, -1, 0, -1, 0, 0, 0, -1, 0, -1, 1, -1, -1, 0, 1, -1, -1, -1, 1, 0, -1, -1,
  1, -1, -1, 0, 0, -1, 0, 0, 0, -1, 0, -1, 1, -1, -1, 0, 1, -1, -1, -1,
]);

const PERM_GRAD2Y = new Float32Array([
  1, 1, -1, -1, 1, 0, -1, 0, 1, 1, 1, 1, -1, 1, -1, -1, 0, 0, 0, 0, 0, 1, 0, 1,
  1, 1, -1, -1, 1, 0, -1, 0, 1, 1, 1, 1, -1, 1, -1, -1, 0, 0, 0, 0, 0, 1, 0, 1,
  1, 1, -1, -1, 1, 0, -1, 0, 1, 1, 1, 1, -1, 1, -1, -1, 0, 0, 0, 0, 0, 1, 0, 1,
  1, 1, -1, -1, 1, 0, -1, 0, 1, 1, 1, 1, -1, 1, -1, -1, 0, 0, 0, 0, 0, 1, 0, 1,
  1, 1, -1, -1, 1, 0, -1, 0, 1, 1, 1, 1, -1, 1, -1, -1, 0, 0, 0, 0, 0, 1, 0, 1,
  1, 1, -1, -1, 1, 0, -1, 0, 1, 1, 1, 0, -1, -1, -1, 1, 0, 0, 0, -1, 0, 1, 0, 0,
  1, -1, -1, 1, 1, 0, -1, -1, 1, 1, 1, 0, -1, -1, -1, 1, 0, 0, 0, -1, 0, 1, 0,
  0, 1, -1, -1, 1, 1, 0, -1, -1, 1, 1, 1, 0, -1, -1, -1, 1, 0, 0, 0, -1, 0, 1,
  0, 0, 1, -1, -1, -1, 1, 0, -1, -1, 1, -1, 1, 0, -1, -1, -1, -1, 0, 0, 0, -1,
  0, -1, 0, 0, 1, -1, -1, -1, 1, 0, -1, -1, 1, 0, 1, -1, -1, -1, -1, 0, 0, -1,
  0, -1, 0, 0, 0, -1, 1, -1, -1, -1, 1, 0, -1, -1, 1, 0, 1, -1, -1, -1, -1, 0,
  1, 1, -1, -1, 1, 0, -1, 0, 1, 1, 1, 1, -1, 1, -1, -1, 0, 0, 0, 0, 0, 1, 0, 1,
  1, 1, -1, -1, 1, 0, -1, 0, 1, 1, 1, 1, -1, 1, -1, -1, 0, 0, 0, 0, 0, 1, 0, 1,
  1, 1, -1, -1, 1, 0, -1, 0, 1, 1, 1, 1, -1, 1, -1, -1, 0, 0, 0, 0, 0, 1, 0, 1,
  1, 1, -1, -1, 1, 0, -1, 0, 1, 1, 1, 1, -1, 1, -1, -1, 0, 0, 0, 0, 0, 1, 0, 1,
  1, 1, -1, -1, 1, 0, -1, 0, 1, 1, 1, 1, -1, 1, -1, -1, 0, 0, 0, 0, 0, 1, 0, 1,
  1, 1, -1, -1, 1, 0, -1, 0, 1, 1, 1, 0, -1, -1, -1, 1, 0, 0, 0, -1, 0, 1, 0, 0,
  1, -1, -1, 1, 1, 0, -1, -1, 1, 1, 1, 0, -1, -1, -1, 1, 0, 0, 0, -1, 0, 1, 0,
  0, 1, -1, -1, 1, 1, 0, -1, -1, 1, 1, 1, 0, -1, -1, -1, 1, 0, 0, 0, -1, 0, 1,
  0, 0, 1, -1, -1, -1, 1, 0, -1, -1, 1, -1, 1, 0, -1, -1, -1, -1, 0, 0, 0, -1,
  0, -1, 0, 0, 1, -1, -1, -1, 1, 0, -1, -1, 1, 0, 1, -1, -1, -1, -1, 0, 0, -1,
  0, -1, 0, 0, 0, -1, 1, -1, -1, -1, 1, 0, -1, -1, 1, 0, 1, -1, -1, -1, -1, 0,
]);

const SQRT3 = 1.7320508075688772;
const F2 = 0.5 * (SQRT3 - 1.0);
const G2 = (3.0 - SQRT3) / 6.0;

/**
 * Performance Optimization: Dependency-free, pre-calculated 2D Simplex Noise.
 * Eliminates dynamic table creation at startup, improves runtime performance by removing
 * function closure overhead, and removes the simplex-noise package from the production bundle.
 */
function noise2D(x: number, y: number): number {
  let n0 = 0;
  let n1 = 0;
  let n2 = 0;

  const s = (x + y) * F2;
  const i = Math.floor(x + s) | 0;
  const j = Math.floor(y + s) | 0;
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = x - X0;
  const y0 = y - Y0;

  let i1 = 0;
  let j1 = 0;
  if (x0 > y0) {
    i1 = 1;
  } else {
    j1 = 1;
  }

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1.0 + 2.0 * G2;
  const y2 = y0 - 1.0 + 2.0 * G2;

  const ii = i & 255;
  const jj = j & 255;

  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) {
    const gi0 = ii + PERM[jj];
    const g0x = PERM_GRAD2X[gi0];
    const g0y = PERM_GRAD2Y[gi0];
    t0 *= t0;
    n0 = t0 * t0 * (g0x * x0 + g0y * y0);
  }

  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) {
    const gi1 = ii + i1 + PERM[jj + j1];
    const g1x = PERM_GRAD2X[gi1];
    const g1y = PERM_GRAD2Y[gi1];
    t1 *= t1;
    n1 = t1 * t1 * (g1x * x1 + g1y * y1);
  }

  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) {
    const gi2 = ii + 1 + PERM[jj + 1];
    const g2x = PERM_GRAD2X[gi2];
    const g2y = PERM_GRAD2Y[gi2];
    t2 *= t2;
    n2 = t2 * t2 * (g2x * x2 + g2y * y2);
  }

  return 70.0 * (n0 + n1 + n2);
}

// Pre-calculate symmetry constants.
const SIN60 = 0.86602540378;

export function buildSnowflake(
  conditions: GrowthConditions,
  rand: Rand,
): BuildResult {
  currentSegmentCount = 0;
  stellarPoolIdx = 0;

  // Use a seeded offset to ensure deterministic but unique noise per snowflake.
  const nOffset = rand.range(0, 1000);

  // Pre-calculate parameters for the entire atmospheric path to avoid thousands
  // of redundant getHabit() and switch-case executions during recursion.
  // Performance Optimization: Use a shared buffer to avoid re-allocating the pathParams array.
  // Gated with a simple change-detection cache to avoid redundant paramsFor lookup calls.
  const pathLen = Math.min(conditions.path.length, MAX_PATH_LEN);
  const pathParams = SHARED_PATH_PARAMS;
  let lastP: Params | null = null;
  let lastT = NaN,
    lastS = NaN;
  for (let i = 0; i < pathLen; i++) {
    const p = conditions.path[i];
    if (p.temp === lastT && p.ss === lastS) {
      pathParams[i] = lastP!;
    } else {
      pathParams[i] = lastP = paramsFor(p.temp, p.ss);
      lastT = p.temp;
      lastS = p.ss;
    }
  }

  // Optimization: Pre-calculate path sampling scale to save multiplications in recursion.
  const pathScale = INV_MAX_DIST * pathLen;
  const maxPathIdx = pathLen - 1;

  // Performance Optimization: Capture invariant parameters and the RNG via closure in a local
  // recursive function. This reduces the number of arguments passed in recursion from 12 to 7,
  // minimizing stack frame overhead and property lookups on every call.
  const rng = rand.rng;

  function buildArmInternal(
    startX: number,
    startY: number,
    dirX: number,
    dirY: number,
    pIdxFloat: number,
    delay: number,
    length: number,
    depth: number,
    params: Params,
  ) {
    if (currentSegmentCount >= MAX_SEGMENTS_PER_ARM) return;

    // Performance Optimization: Destructure params as-needed to minimize property lookups
    // for leaf segments and non-branching nodes.
    const { primaryThickness, thickness015 } = params;

    const halfLen = length * 0.5;
    const midX = startX + dirX * halfLen;
    const midY = startY + dirY * halfLen;
    const vVarRaw = noise2D(midX * 3 + nOffset, midY * 3 + nOffset);
    const sx = primaryThickness + vVarRaw * thickness015;

    // Performance Optimization: Algebraic reduction and breaking of dependency chains.
    // Instead of sequentially deriving sax -> sax2 -> cax -> vJitter, we calculate cax and vJitter
    // directly from vVarRaw. This reduces instruction count and enables parallel execution of
    // independent trigonometric approximations in CPU execution pipelines.
    const sax = vVarRaw * 0.015; // sin(ax) approx: 0.1 * 0.15

    const bIdx = currentSegmentCount << 3; // STRIDE 8
    SEGMENT_BUFFER[bIdx + 0] = dirX;
    SEGMENT_BUFFER[bIdx + 1] = dirY;
    SEGMENT_BUFFER[bIdx + 2] = midX;
    SEGMENT_BUFFER[bIdx + 3] = midY;
    SEGMENT_BUFFER[bIdx + 4] = length;
    SEGMENT_BUFFER[bIdx + 5] = sx;
    SEGMENT_BUFFER[bIdx + 6] = sax;
    SEGMENT_BUFFER[bIdx + 7] = vVarRaw;
    DELAY_BUFFER[currentSegmentCount] = delay;

    currentSegmentCount++;

    if (depth >= params.maxDepth || params.sideBranchProb <= 0) return;

    const { sideBranchProb, sideBranchDecay, cosAngle, sinAngle, decay05 } =
      params;
    const sideLenBase = length * sideBranchDecay;
    if (sideLenBase < 0.08) return;

    // Walk along the main branch, occasionally spawning side branches
    const numSteps = (length * INV_SIDE_BRANCH_STEP) | 0;
    if (numSteps <= 1) return;

    const invNumSteps = INV_STEPS_LUT[numSteps];
    const stepDist = length * invNumSteps;
    const stepX = dirX * stepDist;
    const stepY = dirY * stepDist;
    let pointX = startX;
    let pointY = startY;

    // Performance Optimization: Use additive/multiplicative tracking for atmospheric path sampling and delays to avoid
    // multiplications and divisions in the hot loop.
    const pIdxStep = stepDist * pathScale;
    const delayStep = stepDist * 0.15;

    // Pre-calculate additive steps for local probability and side length decay.
    const lut04 = INV_STEPS_LUT_04[numSteps];
    const probStep = sideBranchProb * lut04;
    const sideLenMaxStep = stepDist * decay05;
    let currentLocalProb = sideBranchProb - probStep;
    let sideLenMax = sideLenBase - sideLenMaxStep;

    const nextDepth = depth + 1;

    // Performance Optimization: Pre-calculate the maximum loop limit where sideLenMax remains >= 0.08.
    // This completely avoids the comparison check and subtraction branch/overhead inside the hot loop.
    let loopLimit = numSteps;
    if (sideLenMaxStep > 0) {
      // Adding a tiny epsilon (1e-9) to handle potential floating-point inaccuracies
      // when dividing very close values, ensuring deterministic and correct iterations.
      const maxI = ((sideLenBase - 0.08) / sideLenMaxStep + 1e-9) | 0;
      if (maxI + 1 < numSteps) {
        loopLimit = maxI + 1;
      }
    }

    for (let i = 1; i < loopLimit; i++) {
      pointX += stepX;
      pointY += stepY;

      // Side branches get less likely near the tip
      // Optimization: Inline rand.chance/range calls to avoid property lookups and method overhead.
      if (rng() < currentLocalProb) {
        const sideLen = sideLenMax * (0.4 + 0.6 * rng());

        // Optimization: Prune side branches early before performing lookups and recursive calls.
        if (sideLen >= 0.08) {
          // Real snowflakes: side branches grow at 60° (hexagonal lattice)
          const noiseVal = noise2D(pointX * 2, pointY * 2);

          const angleVariation = noiseVal * 0.1;
          // Optimization: 2nd-order Taylor expansion for side branch angle perturbations.
          // Small angle approx: cos(a+v) ≈ cos(a) - v*sin(a) - 0.5*v^2*cos(a)
          //                     sin(a+v) ≈ sin(a) + v*cos(a) - 0.5*v^2*sin(a)
          const v = angleVariation + (-0.04 + 0.08 * rng());
          const vSin = v * sinAngle;
          const vCos = v * cosAngle;
          const vHalf = 0.5 * v;
          const cosA = cosAngle - vSin - vHalf * vCos;
          const sinA = sinAngle + vCos - vHalf * vSin;
          // Optimization: Pre-sample parameters for the side branch only when it's created.
          const sidePIdxFloat = pIdxFloat + i * pIdxStep;
          const pIdx = sidePIdxFloat | 0;
          const pathIdx = pIdx > maxPathIdx ? maxPathIdx : pIdx;
          const nextParams = pathParams[pathIdx];

          if (nextDepth <= nextParams.maxDepth) {
            const dxca = dirX * cosA;
            const dysa = dirY * sinA;
            const dxsa = dirX * sinA;
            const dyca = dirY * cosA;

            // Performance Optimization: Pre-calculate the next side-branch delay once instead of
            // evaluating the addition twice per branch pair.
            const nextDelay = delay + i * delayStep + 0.1;

            // Right side branch (sign = 1)
            buildArmInternal(
              pointX,
              pointY,
              dxca - dysa,
              dxsa + dyca,
              sidePIdxFloat,
              nextDelay,
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
              sidePIdxFloat,
              nextDelay,
              sideLen,
              nextDepth,
              nextParams,
            );
          }
        }
      }

      currentLocalProb -= probStep;
      sideLenMax -= sideLenMaxStep;
    }
  }

  // Build one primary arm along +X
  const primaryParams = pathParams[0];
  buildArmInternal(0, 0, 1, 0, 0, 0, 3.5, 0, primaryParams);

  // Optional pointed tip extension for the primary arm
  if (primaryParams.hasTip && currentSegmentCount < MAX_SEGMENTS_PER_ARM) {
    const tipLen = 0.12;
    const tipMidX = 3.56; // endX(3.5) + dirX(1) * 0.06
    const tipVVarRaw = noise2D(tipMidX * 3 + nOffset, nOffset); // tipMidY is 0
    const tsax = tipVVarRaw * 0.015;
    const tsx =
      primaryParams.thickness04 + tipVVarRaw * primaryParams.thickness04_015;

    const tIdx = currentSegmentCount << 3; // STRIDE 8
    SEGMENT_BUFFER[tIdx + 0] = 1; // dirX
    SEGMENT_BUFFER[tIdx + 1] = 0; // dirY
    SEGMENT_BUFFER[tIdx + 2] = tipMidX; // midX
    SEGMENT_BUFFER[tIdx + 3] = 0; // midY
    SEGMENT_BUFFER[tIdx + 4] = tipLen; // length
    SEGMENT_BUFFER[tIdx + 5] = tsx; // sx
    SEGMENT_BUFFER[tIdx + 6] = tsax; // sax
    SEGMENT_BUFFER[tIdx + 7] = tipVVarRaw; // vVarRaw
    DELAY_BUFFER[currentSegmentCount] = 0.625; // 3.5 * 0.15 + 0.1

    currentSegmentCount++;
  }

  // Optimization: Sort segment indices by pre-calculated growth delay. This allows the
  // render loop to break early once it reaches segments that haven't started growing yet.
  const armLen = currentSegmentCount;
  // Performance Optimization: Initialize the indices using bulk set of a pre-allocated IDENTITY_INDICES subarray.
  SEGMENT_INDICES.set(IDENTITY_INDICES.subarray(0, armLen));
  // Performance Optimization: Sort indices in-place using our highly optimized, non-allocating Quicksort.
  if (armLen > 1) {
    quicksort(SEGMENT_INDICES, 0, armLen - 1);
  }

  // Performance Optimization: Use shared scratchpad buffers during calculation to avoid O(N)
  // intermediate allocations. In this single-threaded, synchronous context, subarray() avoids
  // multi-megabyte allocations and copies, as the data is consumed or copied by the caller
  // (scene.updateFlake) immediately.
  const delays = DELAYS_RESULT_BUFFER.subarray(0, armLen);
  // Performance Optimization: Use a shared scratchpad buffer and subarray() to return the result.
  // In this single-threaded, synchronous context, subarray() avoids a multi-megabyte allocation
  // and copy, as the data is consumed or copied by the caller (scene.updateFlake) immediately.
  const matrices = MATRICES_BUFFER.subarray(0, armLen * 96);

  let offset = 0;
  for (let j = 0; j < armLen; j++) {
    const idx = SEGMENT_INDICES[j];
    const delay = DELAY_BUFFER[idx];
    delays[j] = delay;

    // Performance Optimization: All matrix components and jitter are derived on-the-fly from the
    // 8 raw parameters stored in SEGMENT_BUFFER. This reduces memory footprint and improves cache locality
    // by changing the segment stride from 16 to 8.
    const bIdx = idx << 3; // STRIDE 8
    const dirX = SEGMENT_BUFFER[bIdx + 0];
    const dirY = SEGMENT_BUFFER[bIdx + 1];
    const midX = SEGMENT_BUFFER[bIdx + 2];
    const midY = SEGMENT_BUFFER[bIdx + 3];
    const length = SEGMENT_BUFFER[bIdx + 4];
    const sx = SEGMENT_BUFFER[bIdx + 5];
    const sax = SEGMENT_BUFFER[bIdx + 6];
    const vVarRaw = SEGMENT_BUFFER[bIdx + 7];

    const cax = 1 - vVarRaw * vVarRaw * 0.0001125;
    const m0 = -dirY * sx;
    const m1 = dirX * sx;
    const caxy = cax * length;
    const m4 = -dirX * caxy;
    const m5 = -dirY * caxy;
    const m6 = sax * length;
    const m10 = cax * sx;
    const vJitter = vVarRaw * 0.00225;
    const m12 = midX + vJitter;
    const m13 = midY + vJitter;
    const m14 = vJitter;

    // Derive m8 and m9 on-the-fly
    const m8 = m1 * sax;
    const m9 = -m0 * sax;

    // Apply rotation for each of the 6 symmetry instances
    // Optimization: Use interleaved layout [seg0_arm0, seg0_arm1, ..., seg0_arm5, seg1_arm0, ...]
    // to improve cache locality and consolidate GPU update ranges.
    // Performance Optimization: Use hexagonal symmetry identities to unroll the loop
    // and eliminate multiplications.

    // Performance Optimization: Use flat direct assignments for invariant matrix components
    // across all 6 symmetry instances. This is more efficient inside V8 than chained assignments.
    matrices[offset + 6] = m6;
    matrices[offset + 22] = m6;
    matrices[offset + 38] = m6;
    matrices[offset + 54] = m6;
    matrices[offset + 70] = m6;
    matrices[offset + 86] = m6;

    matrices[offset + 10] = m10;
    matrices[offset + 26] = m10;
    matrices[offset + 42] = m10;
    matrices[offset + 58] = m10;
    matrices[offset + 74] = m10;
    matrices[offset + 90] = m10;

    matrices[offset + 14] = m14;
    matrices[offset + 30] = m14;
    matrices[offset + 46] = m14;
    matrices[offset + 62] = m14;
    matrices[offset + 78] = m14;
    matrices[offset + 94] = m14;

    // Performance Optimization: Use explicit initialization for all potential non-zero indices
    // to ensure safety when reusing the shared MATRICES_BUFFER across generations.
    // Arm 0 (Primary Arm, 0°)
    matrices[offset + 0] = m0;
    matrices[offset + 1] = m1;
    matrices[offset + 4] = m4;
    matrices[offset + 5] = m5;
    matrices[offset + 8] = m8;
    matrices[offset + 9] = m9;
    matrices[offset + 12] = m12;
    matrices[offset + 13] = m13;

    // Arm 1 (60°)
    const m0_1 = 0.5 * m0 - SIN60 * m1;
    const m1_1 = SIN60 * m0 + 0.5 * m1;
    const m4_1 = 0.5 * m4 - SIN60 * m5;
    const m5_1 = SIN60 * m4 + 0.5 * m5;
    // Performance Optimization: Derive m8_1 and m9_1 directly using the rotated m0_1 and m1_1 components and sax.
    // This avoids multi-term rotation math (0.5 * m8 - SIN60 * m9) and saves multiple floating-point operations.
    const m8_1 = m1_1 * sax;
    const m9_1 = -m0_1 * sax;
    const m12_1 = 0.5 * m12 - SIN60 * m13;
    const m13_1 = SIN60 * m12 + 0.5 * m13;

    matrices[offset + 16] = m0_1;
    matrices[offset + 17] = m1_1;
    matrices[offset + 20] = m4_1;
    matrices[offset + 21] = m5_1;
    matrices[offset + 24] = m8_1;
    matrices[offset + 25] = m9_1;
    matrices[offset + 28] = m12_1;
    matrices[offset + 29] = m13_1;

    // Arm 2 (120°) = Arm 1 - Arm 0
    const m0_2 = m0_1 - m0;
    const m1_2 = m1_1 - m1;
    const m4_2 = m4_1 - m4;
    const m5_2 = m5_1 - m5;
    // Performance Optimization: Derive m8_2 and m9_2 directly using Arm 1 - Arm 0 identities.
    // This replaces 2 multiplications and a negation with 2 subtractions.
    const m8_2 = m8_1 - m8;
    const m9_2 = m9_1 - m9;
    const m12_2 = m12_1 - m12;
    const m13_2 = m13_1 - m13;
    matrices[offset + 32] = m0_2;
    matrices[offset + 33] = m1_2;
    matrices[offset + 36] = m4_2;
    matrices[offset + 37] = m5_2;
    matrices[offset + 40] = m8_2;
    matrices[offset + 41] = m9_2;
    matrices[offset + 44] = m12_2;
    matrices[offset + 45] = m13_2;

    // Arm 3 (180°) = -Arm 0
    matrices[offset + 48] = -m0;
    matrices[offset + 49] = -m1;
    matrices[offset + 52] = -m4;
    matrices[offset + 53] = -m5;
    matrices[offset + 56] = -m8;
    matrices[offset + 57] = -m9;
    matrices[offset + 60] = -m12;
    matrices[offset + 61] = -m13;

    // Arm 4 (240°) = -Arm 1
    matrices[offset + 64] = -m0_1;
    matrices[offset + 65] = -m1_1;
    matrices[offset + 68] = -m4_1;
    matrices[offset + 69] = -m5_1;
    matrices[offset + 72] = -m8_1;
    matrices[offset + 73] = -m9_1;
    matrices[offset + 76] = -m12_1;
    matrices[offset + 77] = -m13_1;

    // Arm 5 (300°) = -Arm 2
    matrices[offset + 80] = -m0_2;
    matrices[offset + 81] = -m1_2;
    matrices[offset + 84] = -m4_2;
    matrices[offset + 85] = -m5_2;
    matrices[offset + 88] = -m8_2;
    matrices[offset + 89] = -m9_2;
    matrices[offset + 92] = -m12_2;
    matrices[offset + 93] = -m13_2;

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
  return habit === "column" || habit === "needle"
    ? 2.5
    : habit === "capped_column"
      ? 1.8
      : 1.0;
}

interface Params {
  primaryLength: number;
  primaryThickness: number;
  thickness015: number;
  thickness04: number;
  thickness04_015: number;
  sideBranchProb: number;
  sideBranchDecay: number;
  sideBranchAngle: number;
  cosAngle: number;
  sinAngle: number;
  maxDepth: number;
  habit: Habit;
  hasRidges: boolean;
  hasTip: boolean;
  decay05: number;
}

// Performance Optimization: Cache for static Params to avoid repeated allocations.
const PARAMS_CACHE: Partial<Record<Habit, Params>> = {};

// Performance Optimization: Object pooling for stellar_dendrite Params.
// These depend on supersaturation and are thus not strictly static.
const MAX_PATH_LEN = 1024;

// Performance Optimization: Shared buffer for atmospheric path parameters.
const SHARED_PATH_PARAMS = new Array<Params>(MAX_PATH_LEN);

const STELLAR_PARAMS_POOL = Array.from({ length: MAX_PATH_LEN }, () => ({
  primaryLength: 2.8,
  primaryThickness: 0.048,
  thickness015: 0.048 * 0.15,
  thickness04: 0.048 * 0.4,
  thickness04_015: 0.048 * 0.4 * 0.15,
  sideBranchProb: 0,
  sideBranchDecay: 0.6,
  sideBranchAngle: Math.PI / 3,
  cosAngle: 0.5,
  sinAngle: 0.86602540378,
  maxDepth: 3,
  habit: "stellar_dendrite" as Habit,
  hasRidges: true,
  hasTip: true,
  decay05: 0.3,
}));
let stellarPoolIdx = 0;

function paramsFor(temp: number, ss: number): Params {
  const habit = getHabit(temp, ss);

  if (habit === "stellar_dendrite") {
    // Safety check: if the pool is exhausted within a single snowflake generation,
    // fallback to allocation to avoid object mutation collisions.
    if (stellarPoolIdx >= MAX_PATH_LEN) {
      return {
        primaryLength: 2.8,
        primaryThickness: 0.048,
        thickness015: 0.048 * 0.15,
        thickness04: 0.048 * 0.4,
        thickness04_015: 0.048 * 0.4 * 0.15,
        sideBranchProb: 0.55 + ss * 0.25,
        sideBranchDecay: 0.6,
        sideBranchAngle: Math.PI / 3,
        cosAngle: 0.5,
        sinAngle: 0.86602540378,
        maxDepth: 3,
        habit,
        hasRidges: true,
        hasTip: true,
        decay05: 0.3,
      };
    }
    const p = STELLAR_PARAMS_POOL[stellarPoolIdx++];
    p.sideBranchProb = 0.55 + ss * 0.25;
    return p;
  }

  const cached = PARAMS_CACHE[habit];
  if (cached) return cached;

  let p: Omit<
    Params,
    | "cosAngle"
    | "sinAngle"
    | "thickness015"
    | "thickness04"
    | "thickness04_015"
    | "decay05"
  >;
  switch (habit) {
    case "fernlike_dendrite":
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
    case "sector_plate":
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
    case "plate":
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
    case "needle":
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
    case "column":
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
    case "capped_column":
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
        habit: "plate",
        hasRidges: false,
        hasTip: false,
      };
  }

  const result: Params = {
    ...p,
    thickness015: p.primaryThickness * 0.15,
    thickness04: p.primaryThickness * 0.4,
    thickness04_015: p.primaryThickness * 0.4 * 0.15,
    cosAngle: Math.cos(p.sideBranchAngle),
    sinAngle: Math.sin(p.sideBranchAngle),
    decay05: p.sideBranchDecay * 0.5,
  };
  PARAMS_CACHE[habit] = result;
  return result;
}

// Internal utility functions (maintained for compatibility and internal use)
export function rotateVec(v: THREE.Vector3, angle: number): THREE.Vector3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new THREE.Vector3(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
}

export function rotateZ(
  v: THREE.Vector3,
  cos: number,
  sin: number,
): THREE.Vector3 {
  return new THREE.Vector3(v.x * cos - v.y * sin, v.x * sin + v.y * cos, v.z);
}
