/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { announce } from "../../src/ui/announcer";
import {
  WEBGL_CONTEXT_LOST_ANNOUNCEMENT,
  preventSilentContextLoss,
  showReloadCrystalAffordance,
} from "../../src/snowflake/context-loss";

vi.mock("../../src/ui/announcer", () => ({
  announce: vi.fn(),
}));

describe("WebGL context-loss recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `
      <canvas id="scene"></canvas>
      <div id="webgl-recovery" hidden>
        <button type="button" id="btn-reload-crystal">Reload crystal</button>
      </div>
      <div id="a11y-announcer"></div>
    `;
  });

  it("prevents default so the canvas is not left silently unrestorable", () => {
    const event = new Event("webglcontextlost", { cancelable: true });
    preventSilentContextLoss(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("announces context loss and reveals a Reload crystal affordance", () => {
    const overlay = document.getElementById("webgl-recovery");
    const button = document.getElementById("btn-reload-crystal");
    expect(overlay?.hidden).toBe(true);

    announce(WEBGL_CONTEXT_LOST_ANNOUNCEMENT);
    const shown = showReloadCrystalAffordance();

    expect(announce).toHaveBeenCalledWith(
      "Graphics context lost. Reload the crystal to continue.",
    );
    expect(shown).toBe(overlay);
    expect(overlay?.hidden).toBe(false);
    expect(document.activeElement).toBe(button);
  });
});

describe("createScene context-loss path", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("stops rendering, prevents default, and invokes the recovery callback", async () => {
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

    const { createScene } = await import("../../src/snowflake/scene.ts");
    const canvas = document.createElement("canvas");
    const onContextLost = vi.fn();
    const scene = createScene(canvas, { onContextLost });

    scene.start();
    const event = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onContextLost).toHaveBeenCalledTimes(1);

    scene.start();
    scene.dispose();
  });
});
