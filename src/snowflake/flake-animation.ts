import * as THREE from 'three';
import { easeOutExpoUnchecked } from './easing';
import { BuildResult } from './geometry';

export function prepareBranchMesh(
  branchMesh: THREE.InstancedMesh,
  data: BuildResult,
  animate: boolean,
): number {
  const requiredCount = data.matrices.length / 16;
  branchMesh.instanceMatrix.array.set(data.matrices);

  if (!animate) {
    branchMesh.count = requiredCount;
    branchMesh.instanceMatrix.clearUpdateRanges();
    branchMesh.instanceMatrix.needsUpdate = true;
    return data.armCount;
  }

  branchMesh.count = 0;
  const target = branchMesh.instanceMatrix.array as Float32Array;
  for (let i = 0; i < requiredCount; i++) {
    const idx = i * 16;
    target[idx + 0] = target[idx + 1] = target[idx + 2] = 0;
    target[idx + 4] = target[idx + 5] = target[idx + 6] = 0;
    target[idx + 8] = target[idx + 9] = target[idx + 10] = 0;
  }
  branchMesh.instanceMatrix.clearUpdateRanges();
  branchMesh.instanceMatrix.needsUpdate = true;
  return 0;
}

export function updateBranchAnimation(
  branchMesh: THREE.InstancedMesh,
  data: BuildResult,
  eased: number,
  minAnimatedIndex: number,
): number {
  if (eased === 1) {
    branchMesh.instanceMatrix.array.set(data.matrices);
    branchMesh.count = data.armCount * 6;
    branchMesh.instanceMatrix.clearUpdateRanges();
    return data.armCount;
  }

  const target = branchMesh.instanceMatrix.array as Float32Array;
  const source = data.matrices;
  const armLen = data.armCount;
  const threshold2 = eased * 3.0;
  let maxIndex = -1;
  const frameStartMinAnimatedIndex = minAnimatedIndex;

  let batchEnd = minAnimatedIndex;
  while (batchEnd < armLen) {
    const delay = data.delays[batchEnd];
    if (delay > threshold2 || threshold2 - delay < 1) break;
    batchEnd++;
  }

  if (batchEnd > minAnimatedIndex) {
    const offset = minAnimatedIndex * 96;
    const count = (batchEnd - minAnimatedIndex) * 96;
    target.set(source.subarray(offset, offset + count), offset);
    minAnimatedIndex = batchEnd;
    maxIndex = batchEnd - 1;
  }

  // Performance Optimization: Hoist multiplication out of the loop and use additive tracking
  // for the matrix index (stride of 96: 6 arms * 16 floats). This reduces per-frame
  // arithmetic in the growth animation hot path.
  let idx = minAnimatedIndex * 96;
  for (let j = minAnimatedIndex; j < armLen; j++, idx += 96) {
    const delay = data.delays[j];
    if (delay > threshold2) break;

    const s = easeOutExpoUnchecked(threshold2 - delay);
    maxIndex = j;

    const m0s = source[idx + 0] * s;
    const m1s = source[idx + 1] * s;
    const m4s = source[idx + 4] * s;
    const m5s = source[idx + 5] * s;
    const m8s = source[idx + 8] * s;
    const m9s = source[idx + 9] * s;

    const m16s = source[idx + 16] * s;
    const m17s = source[idx + 17] * s;
    const m20s = source[idx + 20] * s;
    const m21s = source[idx + 21] * s;
    const m24s = source[idx + 24] * s;
    const m25s = source[idx + 25] * s;

    const m32s = m16s - m0s;
    const m33s = m17s - m1s;
    const m36s = m20s - m4s;
    const m37s = m21s - m5s;
    const m40s = m24s - m8s;
    const m41s = m25s - m9s;

    const m6s = source[idx + 6] * s;
    const m10s = source[idx + 10] * s;

    target[idx + 0] = m0s;
    target[idx + 1] = m1s;
    target[idx + 4] = m4s;
    target[idx + 5] = m5s;
    target[idx + 6] = m6s;
    target[idx + 8] = m8s;
    target[idx + 9] = m9s;
    target[idx + 10] = m10s;

    target[idx + 16] = m16s;
    target[idx + 17] = m17s;
    target[idx + 20] = m20s;
    target[idx + 21] = m21s;
    target[idx + 22] = m6s;
    target[idx + 24] = m24s;
    target[idx + 25] = m25s;
    target[idx + 26] = m10s;

    target[idx + 32] = m32s;
    target[idx + 33] = m33s;
    target[idx + 36] = m36s;
    target[idx + 37] = m37s;
    target[idx + 38] = m6s;
    target[idx + 40] = m40s;
    target[idx + 41] = m41s;
    target[idx + 42] = m10s;

    target[idx + 48] = -m0s;
    target[idx + 49] = -m1s;
    target[idx + 52] = -m4s;
    target[idx + 53] = -m5s;
    target[idx + 54] = m6s;
    target[idx + 56] = -m8s;
    target[idx + 57] = -m9s;
    target[idx + 58] = m10s;

    target[idx + 64] = -m16s;
    target[idx + 65] = -m17s;
    target[idx + 68] = -m20s;
    target[idx + 69] = -m21s;
    target[idx + 70] = m6s;
    target[idx + 72] = -m24s;
    target[idx + 73] = -m25s;
    target[idx + 74] = m10s;

    target[idx + 80] = -m32s;
    target[idx + 81] = -m33s;
    target[idx + 84] = -m36s;
    target[idx + 85] = -m37s;
    target[idx + 86] = m6s;
    target[idx + 88] = -m40s;
    target[idx + 89] = -m41s;
    target[idx + 90] = m10s;
  }

  if (maxIndex >= frameStartMinAnimatedIndex) {
    branchMesh.count = (maxIndex + 1) * 6;
    const start = frameStartMinAnimatedIndex * 96;
    const count = (maxIndex - frameStartMinAnimatedIndex + 1) * 96;
    if (typeof branchMesh.instanceMatrix.clearUpdateRanges === 'function') {
      branchMesh.instanceMatrix.clearUpdateRanges();
      branchMesh.instanceMatrix.addUpdateRange(start, count);
    } else {
      (branchMesh.instanceMatrix as THREE.InstancedBufferAttribute & {
        updateRange: { offset: number; count: number };
      }).updateRange = { offset: start, count };
    }
    branchMesh.instanceMatrix.needsUpdate = true;
  }

  return minAnimatedIndex;
}
