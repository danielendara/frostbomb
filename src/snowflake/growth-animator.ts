import * as THREE from "three";
import { BuildResult } from "./geometry";

const EASING_LUT_SIZE = 1024;
const LUT_SIZE_MINUS_ONE = EASING_LUT_SIZE - 1;
export const LUT_SCALE_FACTOR = 2 * LUT_SIZE_MINUS_ONE;
const THRESHOLD_SCALE_FACTOR = 1.5 * LUT_SCALE_FACTOR;

const SIN60 = 0.86602540378;

const EASING_LUT = new Float32Array(EASING_LUT_SIZE);
for (let i = 0; i < EASING_LUT_SIZE; i++) {
  const t = i / LUT_SIZE_MINUS_ONE;
  EASING_LUT[i] = t === 0 ? 0 : t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function easeOutExpoFast(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return EASING_LUT[(t * (EASING_LUT_SIZE - 1)) | 0];
}

export class GrowthAnimator {
  public entryState = { progress: 0 };
  public entryActive = false;
  public needsMatrixUpdate = false;
  public minAnimatedIndex = 0;

  private entryStartTime = 0;
  private readonly ENTRY_DURATION_MS = 2200;
  private readonly INV_ENTRY_DURATION = 1 / this.ENTRY_DURATION_MS;
  private canvas: HTMLCanvasElement;
  private lastEntryActive: string | null = null;
  private lastEntryProgress: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.syncEntryState();
  }

  public syncEntryState(): void {
    const active = this.entryActive.toString();
    const progress = this.entryState.progress.toFixed(3);
    if (this.lastEntryActive !== active) {
      this.canvas.setAttribute("data-entry-active", active);
      this.lastEntryActive = active;
    }
    if (this.lastEntryProgress !== progress) {
      this.canvas.setAttribute("data-entry-progress", progress);
      this.lastEntryProgress = progress;
    }
  }

  public startEntryTween(): void {
    this.entryState.progress = 0;
    this.entryStartTime = performance.now();
    this.entryActive = true;
    this.syncEntryState();
  }

  public cancelEntryTween(): void {
    this.entryActive = false;
    this.syncEntryState();
  }

  public tickEntryTween(now: number): void {
    if (!this.entryActive) return;
    const t = (now - this.entryStartTime) * this.INV_ENTRY_DURATION;
    if (t >= 1) {
      this.entryState.progress = 1;
      this.entryActive = false;
    } else {
      this.entryState.progress = easeOutExpoFast(t);
    }
    this.syncEntryState();
  }

  public updateMatrices(
    branchMesh: THREE.InstancedMesh,
    coreMesh: THREE.Mesh,
    flakeHolder: THREE.Group,
    flakeData: BuildResult
  ): void {
    const eased = this.entryState.progress;

    if (eased === 1) {
      // Fast-path for finished animation: bulk copy pre-computed matrices
      branchMesh.instanceMatrix.array.set(flakeData.matrices);
      if (typeof branchMesh.instanceMatrix.clearUpdateRanges === "function") {
        branchMesh.instanceMatrix.clearUpdateRanges();
        branchMesh.instanceMatrix.addUpdateRange(0, flakeData.matrices.length);
      } else {
        (branchMesh.instanceMatrix as any).updateRange = {
          offset: 0,
          count: flakeData.matrices.length,
        };
      }
      branchMesh.instanceMatrix.needsUpdate = true;
      this.minAnimatedIndex = flakeData.armCount;
    } else {
      // Animated growth: apply scale to pre-computed matrices
      const target = branchMesh.instanceMatrix.array as Float32Array;
      const source = flakeData.matrices;
      const armLen = flakeData.armCount;
      const thresholdScaled = eased * THRESHOLD_SCALE_FACTOR;
      const initialMinAnimatedIndex = this.minAnimatedIndex;
      let maxIndex = -1;

      // Pre-filter/fast-forward fully grown segments
      const fullyGrownCutoff = thresholdScaled - LUT_SIZE_MINUS_ONE;
      let j = this.minAnimatedIndex;
      while (j < armLen) {
        if (flakeData.delays[j] > fullyGrownCutoff) break;
        j++;
      }

      if (j > this.minAnimatedIndex) {
        const startOffset = this.minAnimatedIndex * 96;
        const endOffset = j * 96;
        target.set(source.subarray(startOffset, endOffset), startOffset);
        this.minAnimatedIndex = j;
        maxIndex = j - 1;
      }

      let segIdx = this.minAnimatedIndex * 96;
      for (let k = this.minAnimatedIndex; k < armLen; k++) {
        const delay = flakeData.delays[k];
        const diff = thresholdScaled - delay;

        if (diff < 0) break;

        maxIndex = k;
        const s = EASING_LUT[diff | 0];

        const m6s = source[segIdx + 6] * s;
        const m10s = source[segIdx + 10] * s;

        target[segIdx + 6] = m6s;
        target[segIdx + 22] = m6s;
        target[segIdx + 38] = m6s;
        target[segIdx + 54] = m6s;
        target[segIdx + 70] = m6s;
        target[segIdx + 86] = m6s;

        target[segIdx + 10] = m10s;
        target[segIdx + 26] = m10s;
        target[segIdx + 42] = m10s;
        target[segIdx + 58] = m10s;
        target[segIdx + 74] = m10s;
        target[segIdx + 90] = m10s;

        // Arm 0 (Primary Arm, 0°)
        const sm0 = source[segIdx + 0] * s;
        const sm1 = source[segIdx + 1] * s;
        const sm4 = source[segIdx + 4] * s;
        const sm5 = source[segIdx + 5] * s;
        const sm8 = source[segIdx + 8] * s;
        const sm9 = source[segIdx + 9] * s;
        target[segIdx + 0] = sm0;
        target[segIdx + 1] = sm1;
        target[segIdx + 4] = sm4;
        target[segIdx + 5] = sm5;
        target[segIdx + 8] = sm8;
        target[segIdx + 9] = sm9;

        // Arm 1 (60°)
        const sm0_1 = 0.5 * sm0 - SIN60 * sm1;
        const sm1_1 = SIN60 * sm0 + 0.5 * sm1;
        const sm4_1 = 0.5 * sm4 - SIN60 * sm5;
        const sm5_1 = SIN60 * sm4 + 0.5 * sm5;
        const sm8_1 = 0.5 * sm8 - SIN60 * sm9;
        const sm9_1 = SIN60 * sm8 + 0.5 * sm9;
        target[segIdx + 16] = sm0_1;
        target[segIdx + 17] = sm1_1;
        target[segIdx + 20] = sm4_1;
        target[segIdx + 21] = sm5_1;
        target[segIdx + 24] = sm8_1;
        target[segIdx + 25] = sm9_1;

        // Arm 2 (120°) = Arm 1 - Arm 0
        const sm0_2 = sm0_1 - sm0;
        const sm1_2 = sm1_1 - sm1;
        const sm4_2 = sm4_1 - sm4;
        const sm5_2 = sm5_1 - sm5;
        const sm8_2 = sm8_1 - sm8;
        const sm9_2 = sm9_1 - sm9;
        target[segIdx + 32] = sm0_2;
        target[segIdx + 33] = sm1_2;
        target[segIdx + 36] = sm4_2;
        target[segIdx + 37] = sm5_2;
        target[segIdx + 40] = sm8_2;
        target[segIdx + 41] = sm9_2;

        // Arm 3 (180°) = -Arm 0
        target[segIdx + 48] = -sm0;
        target[segIdx + 49] = -sm1;
        target[segIdx + 52] = -sm4;
        target[segIdx + 53] = -sm5;
        target[segIdx + 56] = -sm8;
        target[segIdx + 57] = -sm9;

        // Arm 4 (240°) = -Arm 1
        target[segIdx + 64] = -sm0_1;
        target[segIdx + 65] = -sm1_1;
        target[segIdx + 68] = -sm4_1;
        target[segIdx + 69] = -sm5_1;
        target[segIdx + 72] = -sm8_1;
        target[segIdx + 73] = -sm9_1;

        // Arm 5 (300°) = -Arm 2
        target[segIdx + 80] = -sm0_2;
        target[segIdx + 81] = -sm1_2;
        target[segIdx + 84] = -sm4_2;
        target[segIdx + 85] = -sm5_2;
        target[segIdx + 88] = -sm8_2;
        target[segIdx + 89] = -sm9_2;

        segIdx += 96;
      }

      if (maxIndex >= initialMinAnimatedIndex) {
        if (typeof branchMesh.instanceMatrix.clearUpdateRanges === "function") {
          branchMesh.instanceMatrix.clearUpdateRanges();
          const start = initialMinAnimatedIndex * 96;
          const count = (maxIndex - initialMinAnimatedIndex + 1) * 96;
          branchMesh.instanceMatrix.addUpdateRange(start, count);
        } else {
          const start = initialMinAnimatedIndex * 96;
          const count = (maxIndex - initialMinAnimatedIndex + 1) * 96;
          (branchMesh.instanceMatrix as any).updateRange = {
            offset: start,
            count: count,
          };
        }
        branchMesh.instanceMatrix.needsUpdate = true;
      }
    }

    if (coreMesh && flakeData) {
      const coreData = flakeData.core;
      const s = eased;
      coreMesh.scale.set(coreData.scale[0] * s, coreData.scale[1] * s, coreData.scale[2] * s);
    }

    flakeHolder.position.y = (1 - eased) * -2;
    this.needsMatrixUpdate = false;
  }
}
