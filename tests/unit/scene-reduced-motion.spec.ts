/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildResult } from "../../src/snowflake/geometry";

describe("createScene reduced-motion changes", () => {
  const changeListeners = new Set<(event: MediaQueryListEvent) => void>();
  const motionQuery = {
    matches: false,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
    ) => {
      if (type === "change" && typeof listener === "function") {
        changeListeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    },
    removeEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
    ) => {
      if (type === "change" && typeof listener === "function") {
        changeListeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    },
    addListener: (listener: ((event: MediaQueryListEvent) => void) | null) => {
      if (listener) changeListeners.add(listener);
    },
    removeListener: (listener: ((event: MediaQueryListEvent) => void) | null) => {
      if (listener) changeListeners.delete(listener);
    },
    dispatchEvent: () => true,
  };

  function enableReducedMotion() {
    motionQuery.matches = true;
    for (const listener of changeListeners) {
      listener({ matches: true } as MediaQueryListEvent);
    }
  }

  function buildResult(): BuildResult {
    const matrices = new Float32Array(96);
    for (let arm = 0; arm < 6; arm++) {
      const offset = arm * 16;
      matrices[offset] = 2;
      matrices[offset + 5] = 3;
      matrices[offset + 10] = 4;
      matrices[offset + 12] = arm + 1;
      matrices[offset + 13] = arm + 2;
      matrices[offset + 14] = arm + 3;
      matrices[offset + 15] = 1;
    }
    return {
      armCount: 1,
      branchCount: 6,
      delays: new Float32Array([0]),
      matrices,
      core: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [2, 3, 4],
        dist: 0,
        depth: 0,
      },
    };
  }

  beforeEach(() => {
    vi.resetModules();
    motionQuery.matches = false;
    changeListeners.clear();
    vi.stubGlobal("matchMedia", () => motionQuery as MediaQueryList);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("finishes the existing crystal immediately when motion is reduced mid-growth", async () => {
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
      loadFrostMaps: () => new Promise(() => {}),
    }));
    vi.doMock("../../src/snowflake/postprocessing.ts", () => ({
      PostprocessingPipeline: class {
        setSize() {}
        render() {}
        dispose() {}
        setPhotoMode() {}
        setTier() {}
        requestLoad() {}
        load() {
          return Promise.resolve();
        }
      },
      shouldSkipPostprocessing: () => false,
      skipPostprocessingFromEnvironment: () => false,
      scheduleIdleTask: (task: () => void) => task(),
    }));

    const requestFrame = vi.fn<(callback: FrameRequestCallback) => number>(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const { createScene } = await import("../../src/snowflake/scene.ts");
    const scene = createScene(document.createElement("canvas"));
    const data = buildResult();
    scene.updateFlake(data);
    scene.start();

    const firstFrame = requestFrame.mock.calls[0]?.[0];
    expect(firstFrame).toBeDefined();
    firstFrame?.(performance.now() + 100);

    const branchMesh = scene.flakeHolder.children[0] as unknown as {
      instanceMatrix: { array: Float32Array };
    };
    const coreMesh = scene.flakeHolder.children[1] as { scale: { x: number; y: number; z: number } };
    expect(Array.from(branchMesh.instanceMatrix.array.slice(0, data.matrices.length))).not.toEqual(
      Array.from(data.matrices),
    );
    expect(scene.flakeHolder.position.y).toBeLessThan(0);

    enableReducedMotion();

    expect(Array.from(branchMesh.instanceMatrix.array.slice(0, data.matrices.length))).toEqual(
      Array.from(data.matrices),
    );
    expect(coreMesh.scale).toMatchObject({ x: 2, y: 3, z: 4 });
    expect(scene.flakeHolder.position.y).toBe(0);
    expect(scene.renderer.domElement.getAttribute("data-entry-active")).toBe("false");
    expect(scene.renderer.domElement.getAttribute("data-entry-progress")).toBe("1.000");

    scene.dispose();
  });
});
