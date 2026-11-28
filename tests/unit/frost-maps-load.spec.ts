/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FROST_SIZE } from "../../src/snowflake/frost-data";

describe("loadFrostMaps worker failure", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("falls back to a sync frost bake when the worker fires onerror", async () => {
    vi.stubGlobal(
      "Worker",
      class FakeWorker {
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: ErrorEvent) => void) | null = null;
        terminate = vi.fn();

        constructor() {
          queueMicrotask(() => {
            this.onerror?.(new ErrorEvent("error", { message: "worker blocked" }));
          });
        }
      },
    );

    const { loadFrostMaps } = await import("../../src/snowflake/frost.ts");
    const maps = await loadFrostMaps();
    expect(maps.roughnessMap.image.width).toBe(FROST_SIZE);
    expect(maps.normalMap.image.height).toBe(FROST_SIZE);
  });
});