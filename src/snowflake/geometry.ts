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
  thickness: number;
  depth: number;
  thicknessVariation: number;
}

export interface InstanceData {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  dist: number;
  depth: number;
}

export interface BuildResult {
  armInstances: InstanceData[];
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
    3.5, // Total target length
    0, // depth
    pathParams,
    rand,
    noise2D,
  );

  // Convert one arm to InstanceData
  const armInstances = segmentsToInstanceData(segments);

  // Pre-calculate animation delays for the arm to avoid redundant math in the render loop
  const delays = new Float32Array(armInstances.length);
  for (let j = 0; j < armInstances.length; j++) {
    const inst = armInstances[j];
    delays[j] = inst.dist * 0.15 + inst.depth * 0.1;
  }

  // 6-fold symmetry: compute matrices into the Float32Array.
  // We no longer create a massive 6N array of InstanceData objects here,
  // which saves significant memory allocation and GC pressure.
  const matrices = new Float32Array(armInstances.length * 6 * 16);

  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI * 2) / 6;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let j = 0; j < armInstances.length; j++) {
      const inst = armInstances[j];
      const posX = inst.position[0] * cos - inst.position[1] * sin;
      const posY = inst.position[0] * sin + inst.position[1] * cos;
      const posZ = inst.position[2];
      const rotZ = inst.rotation[2] + angle;

      // Pre-compute matrix
      dummy.position.set(posX, posY, posZ);
      dummy.rotation.set(inst.rotation[0], inst.rotation[1], rotZ);
      dummy.scale.set(inst.scale[0], inst.scale[1], inst.scale[2]);
      dummy.updateMatrix();
      dummy.matrix.toArray(matrices, (i * armInstances.length + j) * 16);
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
    armInstances,
    delays,
    matrices,
    branchCount: armInstances.length * 6 + 1,
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
  length: number,
  depth: number,
  pathParams: Params[],
  rand: Rand,
  noise2D: (x: number, y: number) => number,
) {
  // Sample parameters from the pre-calculated path based on distance from core
  const dist = Math.sqrt(startX * startX + startY * startY);
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
    thickness: params.primaryThickness,
    depth,
    thicknessVariation,
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
    const angle = params.sideBranchAngle + angleVariation + rand.range(-0.04, 0.04);

    for (const sign of [-1, 1]) {
      const a = sign * angle;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const nextDirX = dirX * cos - dirY * sin;
      const nextDirY = dirX * sin + dirY * cos;

      buildArm(
        segments,
        pointX,
        pointY,
        nextDirX,
        nextDirY,
        sideLen,
        depth + 1,
        pathParams,
        rand,
        noise2D,
      );
    }
  }

  // Optional pointed tip extension
  if (params.hasTip && depth === 0) {
    const tipEndX = endX + dirX * 0.12;
    const tipEndY = endY + dirY * 0.12;
    const tipMidX = (endX + tipEndX) * 0.5;
    const tipMidY = (endY + tipEndY) * 0.5;
    const tipThicknessVariation = 1 + noise2D(tipMidX * 3, tipMidY * 3) * 0.15;

    segments.push({
      startX: endX,
      startY: endY,
      endX: tipEndX,
      endY: tipEndY,
      thickness: params.primaryThickness * 0.4,
      depth: depth + 1,
      thicknessVariation: tipThicknessVariation,
    });
  }
}

function segmentsToInstanceData(segments: Segment[]): InstanceData[] {
  const data: InstanceData[] = [];

  for (const seg of segments) {
    const dx = seg.endX - seg.startX;
    const dy = seg.endY - seg.startY;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 0.001) continue;

    const finalThickness = seg.thickness * seg.thicknessVariation;
    const midX = (seg.startX + seg.endX) * 0.5;
    const midY = (seg.startY + seg.endY) * 0.5;

    // Add subtle jitter for organic feel
    const jitter = 0.015;
    const position: [number, number, number] = [
      midX + (seg.thicknessVariation - 1) * jitter,
      midY + (seg.thicknessVariation - 1) * jitter,
      (seg.thicknessVariation - 1) * jitter,
    ];

    const angle = Math.atan2(dy, dx);

    // Default unit cylinder is along Y. We want it along the branch direction.
    // Cylinder is along Y, so rotating by PI/2 around Z makes it along the X-axis (offset).
    const rotation: [number, number, number] = [
      (seg.thicknessVariation - 1) * 0.1, // Subtle tilt
      0,
      angle + Math.PI / 2,
    ];

    const scale: [number, number, number] = [
      finalThickness,
      length,
      finalThickness,
    ];

    data.push({
      position,
      rotation,
      scale,
      dist: Math.sqrt(seg.startX * seg.startX + seg.startY * seg.startY),
      depth: seg.depth,
    });
  }

  return data;
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
