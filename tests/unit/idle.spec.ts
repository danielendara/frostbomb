import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_IDLE_TIMEOUT_MS, scheduleIdleTask } from "../../src/idle";

describe("scheduleIdleTask", () => {
  beforeEach(() => {
    // Unit env is node: expose globalThis as `window` so stubbed globals are seen.
    vi.stubGlobal("window", globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses requestIdleCallback with the given timeout when available", () => {
    const ric = vi.fn((cb: IdleRequestCallback) => cb({} as IdleDeadline));
    vi.stubGlobal("requestIdleCallback", ric);
    const task = vi.fn();
    scheduleIdleTask(task, { timeout: 8_000, fallbackDelayMs: 123 });
    expect(ric).toHaveBeenCalledWith(expect.any(Function), { timeout: 8_000 });
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("defaults the idle timeout", () => {
    const ric = vi.fn();
    vi.stubGlobal("requestIdleCallback", ric);
    scheduleIdleTask(() => {});
    expect(ric).toHaveBeenCalledWith(expect.any(Function), {
      timeout: DEFAULT_IDLE_TIMEOUT_MS,
    });
  });

  it("falls back to setTimeout(fallbackDelayMs) without requestIdleCallback", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const task = vi.fn();
    scheduleIdleTask(task, { fallbackDelayMs: 500 });
    vi.advanceTimersByTime(499);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("fallback delay defaults to 0", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const task = vi.fn();
    scheduleIdleTask(task);
    vi.advanceTimersByTime(0);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
