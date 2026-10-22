import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAIN_THREAD_SLICE_MS,
  STARTUP_LONG_TASK_BUDGET_MS,
  STARTUP_LONG_TASK_GOAL_MS,
  newYieldDeadline,
  yieldIfOverBudget,
  yieldToMain,
} from "../../src/lib/yield-to-main";

describe("yield-to-main", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exports the startup long-task goal and CI regression budget", () => {
    expect(STARTUP_LONG_TASK_GOAL_MS).toBe(200);
    expect(STARTUP_LONG_TASK_BUDGET_MS).toBe(STARTUP_LONG_TASK_GOAL_MS);
    expect(MAIN_THREAD_SLICE_MS).toBeLessThan(STARTUP_LONG_TASK_BUDGET_MS);
  });

  it("yieldToMain falls back to setTimeout when scheduler.yield is missing", async () => {
    const spy = vi.spyOn(globalThis, "setTimeout");
    await yieldToMain();
    expect(spy).toHaveBeenCalled();
  });

  it("yieldIfOverBudget yields when the slice deadline has passed", async () => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(110);
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const next = await yieldIfOverBudget(newYieldDeadline());
    expect(setTimeoutSpy).toHaveBeenCalled();
    expect(next).toBeGreaterThan(50);
  });
});
