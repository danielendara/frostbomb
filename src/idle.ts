/** Default max wait before idle work runs even when the main thread stays busy. */
export const DEFAULT_IDLE_TIMEOUT_MS = 2_000;

export interface IdleTaskOptions {
  /** Passed to `requestIdleCallback` as its `timeout`. */
  timeout?: number;
  /** Delay used by the `setTimeout` fallback when `requestIdleCallback` is unavailable (Safari). */
  fallbackDelayMs?: number;
}

/** Schedules low-priority work on browser idle time, or after `fallbackDelayMs` without `requestIdleCallback`. */
export function scheduleIdleTask(
  task: () => void,
  {
    timeout = DEFAULT_IDLE_TIMEOUT_MS,
    fallbackDelayMs = 0,
  }: IdleTaskOptions = {},
): void {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => task(), { timeout });
  } else {
    window.setTimeout(() => task(), fallbackDelayMs);
  }
}
