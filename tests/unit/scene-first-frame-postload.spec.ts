/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildResult } from "../../src/snowflake/geometry";

describe("createScene postprocessing warmup", () => {
  const requestLoad = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    requestLoad.mockClear();
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
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
        requestLoad = requestLoad;
        load() {
          return Promise.resolve();
        }
      },
      shouldSkipPostprocessing: () => false,
      skipPostprocessingFromEnvironment: () => false,
      scheduleIdleTask: (task: () => void) => task(),
    }));
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
  });

  afterEach(() => {
    vi.doUnmock("../../src/snowflake/frost.ts");
    vi.doUnmock("../../src/snowflake/postprocessing.ts");
    vi.doUnmock("three");
    vi.unstubAllGlobals();
  });

  function buildResult(): BuildResult {
    const matrices = new Float32Array(96);
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

  it("does not request postprocessing until after the first animation frame", async () => {
    const requestFrame = vi.fn<(callback: FrameRequestCallback) => number>(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const { createScene } = await import("../../src/snowflake/scene.ts");
    const scene = createScene(document.createElement("canvas"));
    scene.updateFlake(buildResult());
    scene.start();

    const firstFrame = requestFrame.mock.calls[0]?.[0];
    expect(firstFrame).toBeTypeOf("function");
    firstFrame!(0);
    expect(requestLoad).not.toHaveBeenCalled();

    const secondFrame = requestFrame.mock.calls[1]?.[0];
    expect(secondFrame).toBeTypeOf("function");
    secondFrame!(16);
    expect(requestLoad).toHaveBeenCalled();
  });
});
