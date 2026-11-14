/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from "vitest";
import { testTimeoutOverride } from "../../src/ui/test-timeout";

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.__FROSTBOMB_DOWNLOAD_GAP_MS__;
});

it("honors the override when DEV is true", () => {
  vi.stubEnv("DEV", true);
  window.__FROSTBOMB_DOWNLOAD_GAP_MS__ = 5;
  expect(testTimeoutOverride("__FROSTBOMB_DOWNLOAD_GAP_MS__", 100)).toBe(5);
});

it("returns the fallback when no override is set", () => {
  vi.stubEnv("DEV", true);
  expect(testTimeoutOverride("__FROSTBOMB_DOWNLOAD_GAP_MS__", 100)).toBe(100);
});

it("ignores the override when DEV is false", () => {
  vi.stubEnv("DEV", false);
  window.__FROSTBOMB_DOWNLOAD_GAP_MS__ = 5;
  expect(testTimeoutOverride("__FROSTBOMB_DOWNLOAD_GAP_MS__", 100)).toBe(100);
});
