/** @vitest-environment happy-dom */
import { describe, expect, it, vi, beforeEach } from "vitest";

describe("createScene frost map loading", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("does not leave an unhandled rejection when the frost worker fails to load", async () => {
    vi.doMock("three", async (importOriginal) => {
      const actual = await importOriginal<typeof import("three")>();
      class FakeWebGLRenderer {
        domElement: HTMLCanvasElement;
        constructor(params: { canvas: HTMLCanvasElement }) {
          this.domElement = params.canvas;
        }
        setPixelRatio() {}
        setSize() {}
        setClearColor() {}
        render() {}
        dispose() {}
      }
      return { ...actual, WebGLRenderer: FakeWebGLRenderer };
    });

    vi.doMock("../../src/snowflake/frost.ts", () => ({
      createFrostPlaceholders: () => ({
        roughnessMap: { dispose: () => {} },
        normalMap: { dispose: () => {} },
      }),
      // Simulates a transient worker failure (e.g. blocked by CSP, 404'd
      // worker chunk, etc.) so the returned promise rejects.
      loadFrostMaps: () => Promise.reject(new Error("simulated frost worker failure")),
    }));

    const rejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      const { createScene } = await import("../../src/snowflake/scene.ts");
      const canvas = document.createElement("canvas");

      await createScene(canvas);

      // Let the rejected loadFrostMaps() promise settle and let Node's
      // unhandled-rejection detection run its course.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(rejections).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });
});
