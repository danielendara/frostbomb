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
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  dirX: number;
  dirY: number;
  length: number;
  dist: number;
  thickness: number;
  depth: number;
  thicknessVariation: number;
  midX: number;
  midY: number;
  angle: number;
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

const dummy = new THREE.Object3D();

export function buildSnowflake(
  conditions: GrowthConditions,
  rand: Rand,
): BuildResult {
  const segments: Segment[] = [];
  const noise2D = createNoise2D(() => rand.next());

  // Pre-calculate parameters for the entire atmospheric path to avoid thousands
  // of redundant getHabit() and switch-case executions during recursion.
  const pathParams = conditions.path.map((p) => paramsFor(p.temp, p.ss));

  // Build one primary arm along +X
  buildArm(
    segments,
    0, 0, // startX, startY
    1, 0, // dirX, dirY
    0, // angle
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

  // Pre-calculate symmetry angles
  const cosines = new Float32Array(6);
  const sines = new Float32Array(6);
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI * 2) / 6;
    cosines[i] = Math.cos(angle);
    sines[i] = Math.sin(angle);
  }

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

    // Compute base matrix for the first arm (i=0)
    dummy.position.set(seg.midX + vVar * jitter, seg.midY + vVar * jitter, vVar * jitter);
    dummy.rotation.set(vVar * 0.1, 0, seg.angle + Math.PI / 2);
    dummy.scale.set(finalThickness, length, finalThickness);
    dummy.updateMatrix();
    const m = dummy.matrix.elements;

    // Apply rotation for each of the 6 symmetry instances
    // Optimization: Use additive stride-based indexing to avoid multiplications.
    let offset = j * 16;
    for (let i = 0; i < 6; i++) {
      const c = cosines[i];
      const s = sines[i];

      // Fast-path for i=0 (identity rotation)
      if (i === 0) {
        matrices.set(m, offset);
      } else {
        // Pre-multiply matrix by Z-rotation: M' = Rz * M
        // Column 1
        matrices[offset + 0] = c * m[0] - s * m[1];
        matrices[offset + 1] = s * m[0] + c * m[1];
        matrices[offset + 2] = m[2];
        matrices[offset + 3] = m[3];
        // Column 2
        matrices[offset + 4] = c * m[4] - s * m[5];
        matrices[offset + 5] = s * m[4] + c * m[5];
        matrices[offset + 6] = m[6];
        matrices[offset + 7] = m[7];
        // Column 3
        matrices[offset + 8] = c * m[8] - s * m[9];
        matrices[offset + 9] = s * m[8] + c * m[9];
        matrices[offset + 10] = m[10];
        matrices[offset + 11] = m[11];
        // Column 4 (Translation)
        matrices[offset + 12] = c * m[12] - s * m[13];
        matrices[offset + 13] = s * m[12] + c * m[13];
        matrices[offset + 14] = m[14];
        matrices[offset + 15] = m[15];
      }
      offset += armStride;
    }
  }

  // Core parameters from start of path
  const startParams = paramsFor(conditions.path[0].temp, conditions.path[0].ss);

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
  angle: number,
  dist: number,
  length: number,
  depth: number,
  pathParams: Params[],
  rand: Rand,
  noise2D: (x: number, y: number) => number,
) {
  // Sample parameters from the pre-calculated path based on distance from core
  const maxDist = 3.5;
  const pathIdx = Math.min(
    pathParams.length - 1,
    Math.floor((dist / maxDist) * pathParams.length),
  );
  const params = pathParams[pathIdx];

  if (depth > params.maxDepth || length < 0.08) return;

  const endX = startX + dirX * length;
  const endY = startY + dirY * length;
  const midX = (startX + endX) * 0.5;
  const midY = (startY + endY) * 0.5;
  const thicknessVariation = 1 + noise2D(midX * 3, midY * 3) * 0.15;

  segments.push({
    startX,
    startY,
    endX,
    endY,
    dirX,
    dirY,
    length,
    dist,
    thickness: params.primaryThickness,
    depth,
    thicknessVariation,
    midX,
    midY,
    angle,
    delay: dist * 0.15 + depth * 0.1,
  });

  if (depth >= params.maxDepth) return;

  // Walk along the main branch, occasionally spawning side branches
  const sideBranchStep = 0.35;
  const numSteps = Math.floor(length / sideBranchStep);

  for (let i = 1; i < numSteps; i++) {
    const t = i / numSteps;
    // Side branches get less likely near the tip
    const localProb = params.sideBranchProb * (1 - t * 0.4);
    if (!rand.chance(localProb)) continue;

    const pointX = startX + dirX * (t * length);
    const pointY = startY + dirY * (t * length);
    const sideLen = length * params.sideBranchDecay * rand.range(0.4, 1.0) * (1 - t * 0.5);

    // Real snowflakes: side branches grow at 60° (hexagonal lattice)
    const noiseVal = noise2D(pointX * 2, pointY * 2);
    const angleVariation = noiseVal * 0.1;
    const branchAngle = params.sideBranchAngle + angleVariation + rand.range(-0.04, 0.04);
    const cosA = Math.cos(branchAngle);
    const sinA = Math.sin(branchAngle);
    const sideDist = dist + t * length;

    // Right side branch (sign = 1)
    buildArm(
      segments,
      pointX,
      pointY,
      dirX * cosA - dirY * sinA,
      dirX * sinA + dirY * cosA,
      angle + branchAngle,
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
      dirX * cosA + dirY * sinA,
      -dirX * sinA + dirY * cosA,
      angle - branchAngle,
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
      startX: endX,
      startY: endY,
      endX: tipEndX,
      endY: tipEndY,
      dirX,
      dirY,
      length: tipLen,
      dist: tipDist,
      thickness: params.primaryThickness * 0.4,
      depth: depth + 1,
      thicknessVariation: tipThicknessVariation,
      midX: tipMidX,
      midY: tipMidY,
      angle,
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
