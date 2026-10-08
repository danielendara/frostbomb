import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUrlWriteCoalescer } from "../../src/url-write-coalescer";

describe("createUrlWriteCoalescer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const make = (write: () => void) => createUrlWriteCoalescer(write, 150, () => Date.now());

  it("writes the first request immediately and coalesces the rest into one trailing write", () => {
    const write = vi.fn();
    const c = make(write);
    c.request();
    expect(write).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 50; i++) c.request();
    expect(write).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(150);
    expect(write).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("a 2 s stream of requests makes at most 30 writes", () => {
    const write = vi.fn();
    const c = make(write);
    for (let t = 0; t < 2000; t += 8) {
      c.request();
      vi.advanceTimersByTime(8);
    }
    vi.advanceTimersByTime(200);
    expect(write.mock.calls.length).toBeLessThanOrEqual(30);
    expect(write.mock.calls.length).toBeGreaterThan(1);
  });

  it("flush runs a pending write now and nothing fires afterwards", () => {
    const write = vi.fn();
    const c = make(write);
    c.request();
    c.request();
    c.flush();
    expect(write).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("flush is a no-op when nothing is pending", () => {
    const write = vi.fn();
    const c = make(write);
    c.flush();
    expect(write).not.toHaveBeenCalled();
  });

  it("cancel drops a pending write", () => {
    const write = vi.fn();
    const c = make(write);
    c.request();
    c.request();
    c.cancel();
    vi.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("catches a throwing writer with console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = make(() => {
      throw new Error("SecurityError");
    });
    expect(() => c.request()).not.toThrow();
    c.request();
    expect(() => c.flush()).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
