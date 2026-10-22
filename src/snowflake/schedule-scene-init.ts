import { markOnce } from "./perf-marks";

/** DevTools / regression check: WebGL scene construction begins here, never during module eval. */
export const MARK_SCENE_INIT_BEGIN = "frostbomb:scene-init-begin";

const IDLE_TIMEOUT_MS = 2000;

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

/**
 * Defer heavy WebGL setup until after the first paint: two animation frames,
 * then an idle slice (with timeout) when `requestIdleCallback` exists.
 */
export function scheduleDeferredSceneInit(run: () => void): void {
  const invoke = () => {
    if (!mainModuleFinished) {
      sceneInitRanBeforeMainModuleFinished = true;
    }
    markOnce(MARK_SCENE_INIT_BEGIN);
    run();
  };

  const afterFirstFrame = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(invoke, { timeout: IDLE_TIMEOUT_MS });
        } else {
          invoke();
        }
      });
    });
  };

  afterFirstFrame();
}
