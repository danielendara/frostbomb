import * as THREE from 'three';
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
}

export interface BuildResult {
  group: THREE.Group;
  branchCount: number;
}

export function buildSnowflake(
  conditions: GrowthConditions,
  rand: Rand,
): BuildResult {
  const segments: Segment[] = [];
  const mainAxis = new THREE.Vector3(1, 0, 0);
  const origin = new THREE.Vector3(0, 0, 0);

  const params = paramsFor(conditions);

  // Central hexagonal core
  buildCore(segments, params);

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
      });
    }
  }

  return { group: segmentsToMesh(symmetric, conditions), branchCount: symmetric.length };
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
        primaryLength: 3.8,
        primaryThickness: 0.045,
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
        primaryLength: 3.5,
        primaryThickness: 0.06,
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
        primaryLength: 2.6,
        primaryThickness: 0.22,
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
        primaryLength: 2.2,
        primaryThickness: 0.35,
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
        primaryLength: 4.2,
        primaryThickness: 0.05,
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
        primaryLength: 2.4,
        primaryThickness: 0.5,
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
        primaryLength: 2.8,
        primaryThickness: 0.18,
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

function buildCore(segments: Segment[], params: Params) {
  // Small hexagonal prism core — represented as six short radial segments
  const r = Math.max(0.25, params.primaryThickness * 2);
  for (let i = 0; i < 6; i++) {
    const a0 = (i * Math.PI * 2) / 6;
    const a1 = ((i + 1) * Math.PI * 2) / 6;
    segments.push({
      start: new THREE.Vector3(Math.cos(a0) * r, Math.sin(a0) * r, 0),
      end: new THREE.Vector3(Math.cos(a1) * r, Math.sin(a1) * r, 0),
      thickness: params.primaryThickness * 0.9,
      depth: 0,
    });
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
) {
  if (depth > params.maxDepth || length < 0.08) return;

  const end = start.clone().addScaledVector(direction, length);
  segments.push({ start: start.clone(), end, thickness, depth });

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
    const angle = params.sideBranchAngle + rand.range(-0.08, 0.08);
    for (const sign of [-1, 1]) {
      const dir = rotateVec(direction, sign * angle);
      buildArm(segments, point, dir, sideLen, sideThick, depth + 1, params, rand);
    }
  }

  // Optional pointed tip extension (tiny final segment for dendrites/needles)
  if (params.hasTip && depth === 0) {
    const tipDir = direction.clone();
    const tipEnd = end.clone().addScaledVector(tipDir, 0.12);
    segments.push({
      start: end.clone(),
      end: tipEnd,
      thickness: thickness * 0.4,
      depth: depth + 1,
    });
  }
}

function rotateVec(v: THREE.Vector3, angle: number): THREE.Vector3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new THREE.Vector3(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
}

function segmentsToMesh(segments: Segment[], conditions: GrowthConditions): THREE.Group {
  const group = new THREE.Group();

  // Ice-like physical material: semi-transparent, pale blue, slight roughness
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#d8ecff'),
    metalness: 0.1,
    roughness: 0.15,
    transmission: 0.6,
    thickness: 0.5,
    ior: 1.31, // real refractive index of ice
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    transparent: true,
    opacity: 0.92,
  });

  // Columns get extra Z-depth to feel 3D
  const zDepthScale = conditions.habit === 'column' || conditions.habit === 'needle'
    ? 2.5
    : conditions.habit === 'capped_column'
      ? 1.8
      : 1.0;

  for (const seg of segments) {
    const length = seg.start.distanceTo(seg.end);
    if (length < 0.001) continue;

    const geom = new THREE.BoxGeometry(
      length,
      seg.thickness,
      seg.thickness * zDepthScale,
    );
    const mesh = new THREE.Mesh(geom, material);

    // Position and orient the box so it spans start → end
    const mid = seg.start.clone().add(seg.end).multiplyScalar(0.5);
    mesh.position.copy(mid);
    const dir = seg.end.clone().sub(seg.start).normalize();
    const angle = Math.atan2(dir.y, dir.x);
    mesh.rotation.z = angle;

    // Attach metadata for growth animation
    mesh.userData.dist = seg.start.length(); // Distance from center
    mesh.userData.depth = seg.depth; // Branch depth

    group.add(mesh);
  }

  return group;
}
