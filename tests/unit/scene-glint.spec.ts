/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * createScene wires the glint controller to the tier and to reduced motion: RICH animates the
 * glint by view, LITE and reduced motion get the static one and never run the glint update.
 */
describe("createScene glint mode", () => {
  const changeListeners = new Set<(event: MediaQueryListEvent) => void>();
  const motionQuery = {
    matches: false,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (type === "change" && typeof listener === "function") {
        changeListeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (type === "change" && typeof listener === "function") {
        changeListeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  };

  function setReducedMotion(matches: boolean) {
    motionQuery.matches = matches;
    for (const listener of changeListeners) listener({ matches } as MediaQueryListEvent);
  }

  /** Spy on the controller's `update` by wrapping the real class. */
  async function loadScene(search = "") {
    vi.resetModules();
    window.history.replaceState(null, "", `/${search}`);
    const updates: number[][] = [];
    vi.doMock("../../src/snowflake/glint.ts", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../../src/snowflake/glint.ts")>();
      class SpiedGlintController extends actual.GlintController {
        override update(x: number, y: number, z: number): boolean {
          updates.push([x, y, z]);
          return super.update(x, y, z);
        }
      }
      return { ...actual, GlintController: SpiedGlintController };
    });
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
      },
      shouldSkipPostprocessing: () => false,
      skipPostprocessingFromEnvironment: () => false,
    }));
    const requestFrame = vi.fn<(callback: FrameRequestCallback) => number>(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const { createScene } = await import("../../src/snowflake/scene.ts");
    const scene = createScene(document.createElement("canvas"));
    scene.start();
    let t = 1000;
    const frame = () => {
      t += 16;
      requestFrame.mock.calls[requestFrame.mock.calls.length - 1]?.[0]?.(t);
    };
    return { scene, updates, frame };
  }

  beforeEach(() => {
    motionQuery.matches = false;
    changeListeners.clear();
    vi.stubGlobal("matchMedia", () => motionQuery as MediaQueryList);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("../../src/snowflake/glint.ts");
    window.history.replaceState(null, "", "/");
  });

  it("runs the view-dependent glint, and its update, on RICH", async () => {
    const { scene, updates, frame } = await loadScene("?quality=rich");
    expect(scene.glintMode).toBe("view");
    expect(scene.renderer.domElement.getAttribute("data-glint")).toBe("view");
    frame();
    frame();
    expect(updates.length).toBeGreaterThan(0);
    scene.dispose();
  });

  it("uses the static glint and never calls the glint update on LITE", async () => {
    const { scene, updates, frame } = await loadScene("?quality=lite");
    expect(scene.glintMode).toBe("static");
    expect(scene.renderer.domElement.getAttribute("data-glint")).toBe("static");
    frame();
    frame();
    frame();
    expect(updates).toEqual([]);
    scene.dispose();
  });

  it("starts static under reduced motion even with ?quality=rich", async () => {
    motionQuery.matches = true;
    const { scene, updates, frame } = await loadScene("?quality=rich");
    expect(scene.qualityTier).toBe("lite");
    expect(scene.glintMode).toBe("static");
    frame();
    frame();
    expect(updates).toEqual([]);
    scene.dispose();
  });

  it("freezes the glint when reduced motion turns on mid-session", async () => {
    const { scene, updates, frame } = await loadScene("?quality=rich");
    frame();
    frame();
    const before = updates.length;
    expect(before).toBeGreaterThan(0);

    setReducedMotion(true);
    expect(scene.glintMode).toBe("static");
    expect(scene.renderer.domElement.getAttribute("data-glint")).toBe("static");
    frame();
    frame();
    frame();
    // No glint update after the switch.
    expect(updates.length).toBe(before);
    scene.dispose();
  });
});
