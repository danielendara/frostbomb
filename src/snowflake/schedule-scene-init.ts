import { markOnce } from "./perf-marks";

/** DevTools / regression check: WebGL scene construction begins here, never during module eval. */
export const MARK_SCENE_INIT_BEGIN = "frostbomb:scene-init-begin";

let mainModuleFinished = false;

/** True when scene init ran before `markMainModuleFinished()` — a regression signal for tests. */
export let sceneInitRanBeforeMainModuleFinished = false;

export function markMainModuleFinished(): void {
  mainModuleFinished = true;
}

/** Test-only: reset defer bookkeeping between specs. */
export function resetSceneInitDeferStateForTests(): void {
  mainModuleFinished = false;
  sceneInitRanBeforeMainModuleFinished = false;
}

/** Yield one frame so dynamic import parsing stays out of the same long task as WebGL setup. */
export function yieldToNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * Defer heavy WebGL setup until after the first paint (two animation frames).
 * Scene code is not scheduled on `requestIdleCallback`: on slow CPUs Lighthouse
 * still counts idle-time work toward TBT, which regressed the score.
 */
export function scheduleDeferredSceneInit(run: () => void): void {
  const invoke = () => {
    if (!mainModuleFinished) {
      sceneInitRanBeforeMainModuleFinished = true;
    }
    markOnce(MARK_SCENE_INIT_BEGIN);
    run();
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(invoke);
  });
}
