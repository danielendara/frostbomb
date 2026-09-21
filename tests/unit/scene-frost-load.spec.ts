/** @vitest-environment happy-dom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { BuildResult } from "../../src/snowflake/geometry.ts";

function mockThreeWebGLRenderer() {
  return vi.doMock("three", async (importOriginal) => {
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
}

function mockFrostMaps() {
  return vi.doMock("../../src/snowflake/frost.ts", () => ({
    createFrostPlaceholders: () => ({
      roughnessMap: { dispose: () => {} },
      normalMap: { dispose: () => {} },
    }),
    loadFrostMaps: () =>
      Promise.resolve({
        roughnessMap: { dispose: () => {} },
        normalMap: { dispose: () => {} },
      }),
  }));
}

describe("createScene frost map loading", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("does not leave an unhandled rejection when the frost worker fails to load", async () => {
    mockThreeWebGLRenderer();
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

      createScene(canvas);

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

describe("createScene reduced motion mid-growth (#342)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("snaps branch, core, and holder to the completed pose when motion is reduced mid-entry", async () => {
    mockThreeWebGLRenderer();
    mockFrostMaps();

    const reducedMotionListeners: Array<(event: MediaQueryListEvent) => void> = [];
    let reducedMotionMatches = false;
    const reducedMotionQuery = {
      get matches() {
        return reducedMotionMatches;
      },
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        reducedMotionListeners.push(listener);
      },
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("matchMedia", () => reducedMotionQuery);

    const { createScene } = await import("../../src/snowflake/scene.ts");
    const canvas = document.createElement("canvas");
    const scene = createScene(canvas);

    const flakeData: BuildResult = {
      armCount: 1,
      branchCount: 1,
      delays: new Float32Array([512]),
      matrices: new Float32Array(96),
      core: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [0.5, 0.5, 0.5],
        dist: 0,
        depth: 0,
      },
    };
    for (let i = 0; i < flakeData.matrices.length; i++) {
      flakeData.matrices[i] = i * 0.01;
    }

    scene.updateFlake(flakeData, true);
    expect(canvas.getAttribute("data-entry-active")).toBe("true");

    let frameCallback: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frameCallback = cb;
      return 1;
    });

    let now = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    scene.start();
    now += 400;
    frameCallback?.(now);

    expect(canvas.getAttribute("data-entry-progress")).not.toBe("1.000");
    expect(scene.flakeHolder.position.y).not.toBe(0);

    reducedMotionMatches = true;
    for (const listener of reducedMotionListeners) {
      listener({ matches: true } as MediaQueryListEvent);
    }

    expect(canvas.getAttribute("data-entry-active")).toBe("false");
    expect(canvas.getAttribute("data-entry-progress")).toBe("1.000");
    expect(scene.isAutoRotateEnabled).toBe(false);
    expect(scene.flakeHolder.position.y + 0).toBe(0);

    const branchMesh = scene.flakeHolder.children.find(
      (child) => (child as { isInstancedMesh?: boolean }).isInstancedMesh,
    ) as import("three").InstancedMesh | undefined;
    const coreMesh = scene.flakeHolder.children.find(
      (child) => !(child as { isInstancedMesh?: boolean }).isInstancedMesh,
    ) as import("three").Mesh | undefined;

    expect(branchMesh).toBeDefined();
    expect(coreMesh).toBeDefined();
    expect(Array.from(branchMesh!.instanceMatrix.array.subarray(0, 96))).toEqual(
      Array.from(flakeData.matrices),
    );
    expect(coreMesh!.scale.x).toBeCloseTo(flakeData.core.scale[0]);
    expect(coreMesh!.scale.y).toBeCloseTo(flakeData.core.scale[1]);
    expect(coreMesh!.scale.z).toBeCloseTo(flakeData.core.scale[2]);

    scene.dispose();
  });
});
