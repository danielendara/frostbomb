/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("createScene pointer buttons", () => {
  let canvas: HTMLCanvasElement;

  type DragState = { isDragging: boolean; x: number; y: number };
  function dragState(): DragState {
    return (window as any).__FROSTBOMB_DRAG__();
  }

  function pointer(
    type: string,
    init: PointerEventInit & { button: number },
    target: EventTarget,
  ) {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: init.clientX ?? 0,
      clientY: init.clientY ?? 0,
      button: init.button,
      ctrlKey: init.ctrlKey ?? false,
    });
    Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 1 });
    Object.defineProperty(event, "pointerType", {
      value: init.pointerType ?? "mouse",
    });
    target.dispatchEvent(event);
  }

  async function makeScene() {
    const { createScene } = await import("../../src/snowflake/scene.ts");
    return createScene(canvas);
  }

  beforeEach(() => {
    vi.resetModules();
    canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    vi.stubGlobal(
      "matchMedia",
      () =>
        ({
          matches: false,
          media: "",
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
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
        requestLoad() {}
        load() {
          return Promise.resolve();
        }
      },
      skipPostprocessingFromEnvironment: () => false,
    }));
  });

  afterEach(() => {
    canvas.remove();
    vi.unstubAllGlobals();
    vi.doUnmock("three");
    vi.doUnmock("../../src/snowflake/frost.ts");
    vi.doUnmock("../../src/snowflake/postprocessing.ts");
  });

  it("does not start a drag on a right-button pointerdown", async () => {
    const scene = await makeScene();
    pointer("pointerdown", { button: 2, clientX: 10, clientY: 10 }, canvas);
    pointer("pointermove", { button: -1, clientX: 80, clientY: 10 }, window);
    expect(dragState().isDragging).toBe(false);
    expect(dragState().y).toBe(0);
    scene.dispose();
  });

  it("does not start a drag on a middle-button pointerdown", async () => {
    const scene = await makeScene();
    pointer("pointerdown", { button: 1, clientX: 10, clientY: 10 }, canvas);
    pointer("pointermove", { button: -1, clientX: 80, clientY: 10 }, window);
    expect(dragState().isDragging).toBe(false);
    expect(dragState().y).toBe(0);
    scene.dispose();
  });

  it("does not start a drag on a Ctrl+click (macOS context menu)", async () => {
    const scene = await makeScene();
    pointer(
      "pointerdown",
      { button: 0, ctrlKey: true, clientX: 10, clientY: 10 },
      canvas,
    );
    pointer("pointermove", { button: -1, clientX: 80, clientY: 10 }, window);
    expect(dragState().isDragging).toBe(false);
    expect(dragState().y).toBe(0);
    scene.dispose();
  });

  it("still rotates on a left-button drag", async () => {
    const scene = await makeScene();
    pointer("pointerdown", { button: 0, clientX: 10, clientY: 10 }, canvas);
    expect(dragState().isDragging).toBe(true);
    pointer("pointermove", { button: -1, clientX: 80, clientY: 10 }, window);
    expect(dragState().y).toBeCloseTo(0.7);
    pointer("pointerup", { button: 0, clientX: 80, clientY: 10 }, window);
    expect(dragState().isDragging).toBe(false);
    scene.dispose();
  });

  it("ends a left drag on contextmenu and ignores later moves", async () => {
    const scene = await makeScene();
    pointer("pointerdown", { button: 0, clientX: 10, clientY: 10 }, canvas);
    pointer("pointermove", { button: -1, clientX: 80, clientY: 10 }, window);
    const before = dragState().y;
    canvas.dispatchEvent(new Event("contextmenu", { bubbles: true }));
    expect(dragState().isDragging).toBe(false);
    pointer("pointermove", { button: -1, clientX: 200, clientY: 10 }, window);
    expect(dragState().y).toBe(before);
    scene.dispose();
  });

  it("removes the contextmenu listener on dispose", async () => {
    const removeSpy = vi.spyOn(canvas, "removeEventListener");
    const scene = await makeScene();
    scene.dispose();
    expect(removeSpy).toHaveBeenCalledWith("contextmenu", expect.any(Function));
    removeSpy.mockRestore();
  });
});
