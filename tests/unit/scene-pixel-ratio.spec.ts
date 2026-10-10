/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("createScene pixel ratio", () => {
  type Listener = () => void;
  let reducedMotion = false;
  let dprListeners: Set<Listener>;
  let removeDprListener: ReturnType<typeof vi.fn>;
  let setPixelRatio: ReturnType<typeof vi.fn>;

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
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.doMock("three", async (importOriginal) => {
      const actual = await importOriginal<typeof import("three")>();
      class FakeWebGLRenderer {
        domElement: HTMLCanvasElement;
        constructor(params: { canvas: HTMLCanvasElement }) {
          this.domElement = params.canvas;
        }
        setPixelRatio = setPixelRatio;
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
        requestLoad() {}
        load() {
          return Promise.resolve();
        }
      },
      skipPostprocessingFromEnvironment: () => false,
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
    expect(lastRatio()).toBe(2);
    setDpr(3);
    window.dispatchEvent(new Event("resize"));
    expect(lastRatio()).toBe(2);
    scene.dispose();
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

  it("caps the ratio at 1 under reduced motion (floored at 0.75 by quality scale)", async () => {
    reducedMotion = true;
    setDpr(2);
    const scene = await makeScene();
    expect(lastRatio()).toBe(0.75);
    fireDprChange(3);
    expect(lastRatio()).toBe(0.75);
    scene.dispose();
  });

  it("removes the DPR listener on dispose", async () => {
    const scene = await makeScene();
    scene.dispose();
    expect(removeDprListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(dprListeners.size).toBe(0);
  });
});
