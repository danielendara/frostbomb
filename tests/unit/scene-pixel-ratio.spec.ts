/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("createScene pixel ratio", () => {
  type Listener = () => void;
  let reducedMotion = false;
  let dprListeners: Set<Listener>;
  let removeDprListener: ReturnType<typeof vi.fn>;
  let setPixelRatio: ReturnType<typeof vi.fn>;
  let setSize: ReturnType<typeof vi.fn>;
  let pipelineSetSize: ReturnType<typeof vi.fn>;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;

  function flushFrames() {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  }

  function setDpr(value: number) {
    Object.defineProperty(window, "devicePixelRatio", { value, configurable: true });
  }

  function fireDprChange(value: number) {
    setDpr(value);
    const pending = [...dprListeners];
    dprListeners.clear();
    for (const listener of pending) listener();
  }

  function lastRatio() {
    return setPixelRatio.mock.calls.at(-1)?.[0];
  }

  async function makeScene() {
    const { createScene } = await import("../../src/snowflake/scene.ts");
    return createScene(document.createElement("canvas"));
  }

  beforeEach(() => {
    vi.resetModules();
    reducedMotion = false;
    dprListeners = new Set();
    removeDprListener = vi.fn((_type: string, listener: Listener) => {
      dprListeners.delete(listener);
    });
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    pipelineSetSize = vi.fn();
    frames = new Map();
    nextFrame = 1;
    setDpr(1);
    vi.stubGlobal("matchMedia", (query: string) => {
      if (query.startsWith("(resolution")) {
        return {
          matches: true,
          media: query,
          addEventListener: (_type: string, listener: Listener) => dprListeners.add(listener),
          removeEventListener: removeDprListener,
        } as unknown as MediaQueryList;
      }
      return {
        matches: reducedMotion,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      } as unknown as MediaQueryList;
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.doMock("three", async (importOriginal) => {
      const actual = await importOriginal<typeof import("three")>();
      class FakeWebGLRenderer {
        domElement: HTMLCanvasElement;
        constructor(params: { canvas: HTMLCanvasElement }) {
          this.domElement = params.canvas;
        }
        setPixelRatio = setPixelRatio;
        setSize = setSize;
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
        setSize = pipelineSetSize;
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("three");
  });

  it("recomputes the ratio on resize after the DPR changes", async () => {
    const scene = await makeScene();
    expect(lastRatio()).toBe(1);
    setDpr(2);
    window.dispatchEvent(new Event("resize"));
    flushFrames();
    expect(lastRatio()).toBe(2);
    setDpr(3);
    window.dispatchEvent(new Event("resize"));
    flushFrames();
    expect(lastRatio()).toBe(2);
    scene.dispose();
  });

  it("coalesces resizes and cancels pending work on dispose", async () => {
    const scene = await makeScene();
    setSize.mockClear();
    pipelineSetSize.mockClear();
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
    expect(setSize).not.toHaveBeenCalled();
    flushFrames();
    expect(setSize).toHaveBeenCalledTimes(1);
    expect(pipelineSetSize).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("resize"));
    scene.dispose();
    flushFrames();
    expect(setSize).toHaveBeenCalledTimes(1);
    expect(pipelineSetSize).toHaveBeenCalledTimes(1);
  });

  it("recomputes the ratio on a matchMedia change without resize, and re-arms", async () => {
    const scene = await makeScene();
    fireDprChange(2);
    expect(lastRatio()).toBe(2);
    expect(dprListeners.size).toBe(1);
    fireDprChange(1.5);
    expect(lastRatio()).toBe(1.5);
    scene.dispose();
  });

  it("caps the ratio at 1 under reduced motion (reduced motion forces LITE)", async () => {
    reducedMotion = true;
    setDpr(2);
    const scene = await makeScene();
    expect(lastRatio()).toBe(1);
    fireDprChange(3);
    expect(lastRatio()).toBe(1);
    scene.dispose();
  });

  it("caps the ratio at 1.5 on LITE and 2 on RICH", async () => {
    setDpr(3);
    const scene = await makeScene();
    expect(scene.qualityTier).toBe("rich");
    expect(lastRatio()).toBe(2);
    scene.setQualityTier("lite");
    expect(lastRatio()).toBe(1.5);
    scene.dispose();
  });

  it("keeps the 0.75 floor on a sub-1 devicePixelRatio", async () => {
    setDpr(0.5);
    const scene = await makeScene();
    expect(lastRatio()).toBe(0.75);
    scene.dispose();
  });

  it("reflects the tier on canvas[data-quality] and lets reduced motion keep LITE", async () => {
    const { createScene } = await import("../../src/snowflake/scene.ts");
    const canvas = document.createElement("canvas");
    const scene = createScene(canvas);
    expect(canvas.getAttribute("data-quality")).toBe("rich");
    scene.setQualityTier("lite");
    expect(canvas.getAttribute("data-quality")).toBe("lite");
    scene.dispose();

    vi.resetModules();
    reducedMotion = true;
    const again = await import("../../src/snowflake/scene.ts");
    const canvas2 = document.createElement("canvas");
    const scene2 = again.createScene(canvas2);
    expect(canvas2.getAttribute("data-quality")).toBe("lite");
    expect(scene2.setQualityTier("rich")).toBe("lite");
    expect(canvas2.getAttribute("data-quality")).toBe("lite");
    scene2.dispose();
  });

  it("removes the DPR listener on dispose", async () => {
    const scene = await makeScene();
    scene.dispose();
    expect(removeDprListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(dprListeners.size).toBe(0);
  });
});
