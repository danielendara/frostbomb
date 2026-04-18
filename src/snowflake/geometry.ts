import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { Rand } from './random.ts';
import type { GrowthConditions, Habit } from './nakaya.ts';

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
  start: THREE.Vector3;
  end: THREE.Vector3;
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
  instances: InstanceData[];
  branchCount: number;
  core: InstanceData;
}

export function buildSnowflake(
  conditions: GrowthConditions,
  rand: Rand,
): BuildResult {
  const segments: Segment[] = [];
  const mainAxis = new THREE.Vector3(1, 0, 0);
  const origin = new THREE.Vector3(0, 0, 0);

  const params = paramsFor(conditions);

  const noise2D = createNoise2D(() => rand.next());

  // Build one primary arm along +X
  buildArm(
    segments,
    origin,
    mainAxis,
    params.primaryLength,
    params.primaryThickness,
    0,
    params,
    rand,
    noise2D,
  );

  // 6-fold symmetry: clone the arm at 60° intervals
  const symmetric: Segment[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI * 2) / 6;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const seg of segments) {
      symmetric.push({
        start: rotateZ(seg.start, cos, sin),
        end: rotateZ(seg.end, cos, sin),
        thickness: seg.thickness,
        depth: seg.depth,
        thicknessVariation: seg.thicknessVariation,
      });
    }
  }

  const instances = segmentsToInstanceData(symmetric);

  // Add a solid hexagonal core
  const coreRadius = Math.max(0.2, params.primaryThickness * 2.5);
  const zDepthScale = getZDepthScale(conditions.habit);
  const coreHeight = params.primaryThickness * zDepthScale * 1.2;

  const core: InstanceData = {
    position: [0, 0, 0],
    rotation: [Math.PI / 2, 0, Math.PI / 6], // Lay flat and align with arms
    scale: [coreRadius * 2, coreHeight, coreRadius * 2],
    dist: 0,
    depth: 0,
  };

  return { instances, branchCount: symmetric.length + 1, core };
}

function getZDepthScale(habit: Habit): number {
  return habit === 'column' || habit === 'needle'
    ? 2.5
    : habit === 'capped_column'
      ? 1.8
      : 1.0;
}

function rotateZ(v: THREE.Vector3, cos: number, sin: number): THREE.Vector3 {
  return new THREE.Vector3(v.x * cos - v.y * sin, v.x * sin + v.y * cos, v.z);
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

function paramsFor(c: GrowthConditions): Params {
  const ss = c.supersaturation;
  switch (c.habit) {
    case 'fernlike_dendrite':
      return {
        primaryLength: 3.04,
        primaryThickness: 0.036,
        sideBranchProb: 0.85,
        sideBranchDecay: 0.68,
        sideBranchAngle: Math.PI / 3,
        maxDepth: 4,
        habit: c.habit,
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
        habit: c.habit,
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
        habit: c.habit,
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
        habit: c.habit,
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
        habit: c.habit,
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
        habit: c.habit,
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
        habit: c.habit,
        hasRidges: true,
        hasTip: true,
      };
  }
}

function buildArm(
  segments: Segment[],
  start: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  thickness: number,
  depth: number,
  params: Params,
  rand: Rand,
  noise2D: (x: number, y: number) => number,
) {
  if (depth > params.maxDepth || length < 0.08) return;

  const end = start.clone().addScaledVector(direction, length);
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const thicknessVariation = 1 + noise2D(mid.x * 3, mid.y * 3) * 0.15;

  segments.push({
    start: start.clone(),
    end,
    thickness,
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

    const point = start.clone().addScaledVector(direction, t * length);
    const sideLen = length * params.sideBranchDecay * rand.range(0.4, 1.0) * (1 - t * 0.5);
    const sideThick = thickness * 0.6;

    // Real snowflakes: side branches grow at 60° (hexagonal lattice)
    // Add organic variation using simplex noise based on position and depth
    const noiseVal = noise2D(point.x * 2, point.y * 2);
    const angleVariation = noiseVal * 0.1;
    const angle = params.sideBranchAngle + angleVariation + rand.range(-0.04, 0.04);

    for (const sign of [-1, 1]) {
      const dir = rotateVec(direction, sign * angle);
      buildArm(
        segments,
        point,
        dir,
        sideLen,
        sideThick,
        depth + 1,
        params,
        rand,
        noise2D,
      );
    }
  }

  // Optional pointed tip extension (tiny final segment for dendrites/needles)
  if (params.hasTip && depth === 0) {
    const tipDir = direction.clone();
    const tipEnd = end.clone().addScaledVector(tipDir, 0.12);
    const tipMid = end.clone().add(tipEnd).multiplyScalar(0.5);
    const tipThicknessVariation = 1 + noise2D(tipMid.x * 3, tipMid.y * 3) * 0.15;

    segments.push({
      start: end.clone(),
      end: tipEnd,
      thickness: thickness * 0.4,
      depth: depth + 1,
      thicknessVariation: tipThicknessVariation,
    });
  }
}

function rotateVec(v: THREE.Vector3, angle: number): THREE.Vector3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new THREE.Vector3(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
}

function segmentsToInstanceData(
  segments: Segment[],
): InstanceData[] {
  const data: InstanceData[] = [];

  for (const seg of segments) {
    const length = seg.start.distanceTo(seg.end);
    if (length < 0.001) continue;

    const finalThickness = seg.thickness * seg.thicknessVariation;

    const segmentMid = seg.start.clone().add(seg.end).multiplyScalar(0.5);

    // Add subtle jitter for organic feel
    const jitter = 0.015;
    const position: [number, number, number] = [
      segmentMid.x + (seg.thicknessVariation - 1) * jitter,
      segmentMid.y + (seg.thicknessVariation - 1) * jitter,
      segmentMid.z + (seg.thicknessVariation - 1) * jitter,
    ];

    const dir = seg.end.clone().sub(seg.start).normalize();
    const angle = Math.atan2(dir.y, dir.x);

    // Default unit cylinder is along Y. We want it along the branch direction.
    // We'll rotate it around Z by angle, but first we need it to be horizontal.
    // Cylinder is along Y, so rotating by -PI/2 around Z makes it along X.
    // Then we add our angle.
    const rotation: [number, number, number] = [
      (seg.thicknessVariation - 1) * 0.1, // Subtle tilt out of plane (around X)
      0,
      angle + Math.PI / 2, // Rotate to match direction
    ];

    // Scale: X and Z for thickness, Y for length
    const scale: [number, number, number] = [
      finalThickness,
      length,
      finalThickness,
    ];

    data.push({
      position,
      rotation,
      scale,
      dist: seg.start.length(),
      depth: seg.depth,
    });
  }

  return data;
}
