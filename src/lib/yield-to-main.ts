/** Time slice before yielding during startup work (Modern Web Guidance: break-up-long-tasks). */
export const MAIN_THREAD_SLICE_MS = 50;

/** Field goal for a single startup long task (Lighthouse mobile). */
export const STARTUP_LONG_TASK_GOAL_MS = 200;

/**
 * CI regression ceiling (headless SwiftShader + emulated basic phone). Stricter than
 * production devices but catches reintroduced multi-second main-thread blocks.
 */
export const STARTUP_LONG_TASK_BUDGET_MS = STARTUP_LONG_TASK_GOAL_MS;

type SchedulerLike = { yield: () => Promise<void> };

export async function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: SchedulerLike }).scheduler;
  if (scheduler?.yield) {
    await scheduler.yield();
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Hard macrotask boundary for breaking SwiftShader long tasks during scene boot. */
export async function yieldSceneBootSlice(): Promise<void> {
  await yieldToMain();
  await yieldToMain();
}

/** Returns the next deadline after yielding when the current slice is exhausted. */
export async function yieldIfOverBudget(deadlineMs: number): Promise<number> {
  if (performance.now() < deadlineMs) return deadlineMs;
  await yieldToMain();
  return performance.now() + MAIN_THREAD_SLICE_MS;
}

export function newYieldDeadline(): number {
  return performance.now() + MAIN_THREAD_SLICE_MS;
}
