/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildResult } from "../../src/snowflake/geometry";

const { buildSceneEnvironment, envDispose } = vi.hoisted(() => ({
  buildSceneEnvironment: vi.fn(),
  envDispose: vi.fn(),
}));

vi.mock("../../src/snowflake/scene-environment.ts", () => ({
  ENV_PMREM_SIZE: { rich: 512, lite: 256 },
  buildSceneEnvironment,
}));

describe("procedural scene environment", () => {
  const requestLoad = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    buildSceneEnvironment.mockReset();
    envDispose.mockReset();
    requestLoad.mockClear();
    buildSceneEnvironment.mockImplementation(() => ({
      texture: { uuid: "test-env" },
      dispose: envDispose,
    }));

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

  async function runFrames(frameCount: number) {
    const requestFrame = vi.fn<(callback: FrameRequestCallback) => number>(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const { createScene } = await import("../../src/snowflake/scene.ts");
    const scene = createScene(document.createElement("canvas"));
    scene.updateFlake(buildResult(), false);
    scene.start();

    for (let i = 0; i < frameCount; i++) {
      const cb = requestFrame.mock.calls[i]?.[0];
      expect(cb).toBeTypeOf("function");
      cb!(i * 16);
    }
    return scene;
  }

  it("assigns the environment once after the first painted frame and disposes it", async () => {
    const scene = await runFrames(3);
    await vi.waitFor(() => {
      expect(buildSceneEnvironment).toHaveBeenCalledTimes(1);
      expect(scene.scene.environment).toEqual({ uuid: "test-env" });
    });
    scene.dispose();
    expect(envDispose).toHaveBeenCalledTimes(1);
    expect(scene.scene.environment).toBeNull();
  });

  it("does not build the environment on the first animation frame", async () => {
    await runFrames(1);
    expect(buildSceneEnvironment).not.toHaveBeenCalled();
  });
});
