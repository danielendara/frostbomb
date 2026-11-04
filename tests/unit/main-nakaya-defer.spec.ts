/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";

const diagramState = vi.hoisted(() => ({
  initCalls: 0,
  backgroundDraws: 0,
}));

vi.mock("../../src/snowflake/scene", () => ({
  createScene: () => ({
    start: vi.fn(),
    dispose: vi.fn(),
    isAutoRotateEnabled: false,
    isPinkModeEnabled: false,
    isPrismModeEnabled: false,
    isGlowEnabled: false,
    setAutoRotate: vi.fn(),
    setPinkMode: vi.fn(),
    setPrismMode: vi.fn(),
    setGlowMode: vi.fn(),
    setPhotoMode: vi.fn(),
    setQualityTier: vi.fn(),
    updateFlake: vi.fn(),
    resetView: vi.fn(),
    rotateView: vi.fn(),
    qualityTier: "rich",
    renderer: { capabilities: { maxTextureSize: 4096 } },
  }),
}));

vi.mock("../../src/snowflake/webgl-fallback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/snowflake/webgl-fallback")>()),
  hasWebGL2: () => true,
}));

vi.mock("../../src/snowflake/diagram", () => ({
  initNakayaDiagram: (_canvas: HTMLCanvasElement, options?: { deferBackground?: boolean }) => {
    diagramState.initCalls++;
    let backgroundReady = !options?.deferBackground;
    return {
      update: vi.fn(),
      ensureBackground: () => {
        diagramState.backgroundDraws++;
        backgroundReady = true;
      },
      hasBackground: () => backgroundReady,
      dispose: vi.fn(),
    };
  },
}));

const FIXTURE = `
  <canvas id="scene"></canvas>
  <div id="a11y-announcer"></div>
  <button id="guide-toggle" aria-pressed="false" aria-expanded="false"></button>
  <div id="field-guide" style="display: none;" tabindex="-1"></div>
  <div id="stats-display"></div>
  <canvas id="nakaya-diagram" width="300" height="200"></canvas>
  <button id="lab-toggle" aria-pressed="false" aria-expanded="false">
    Lab Mode: <span id="lab-status">OFF</span>
  </button>
  <div id="lab-controls" style="display: none;"></div>
  <div id="recent-seeds-container"><div id="recent-seeds-list"></div></div>
  <button id="btn-clear-history">Clear</button>
`;

function installMatchMedia() {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const realFetch = window.fetch;
const realSendBeacon = Object.getOwnPropertyDescriptor(window.navigator, "sendBeacon");

afterEach(() => {
  window.fetch = realFetch;
  if (realSendBeacon) Object.defineProperty(window.navigator, "sendBeacon", realSendBeacon);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  diagramState.initCalls = 0;
  diagramState.backgroundDraws = 0;
});

describe("Nakaya diagram lazy init", () => {
  it("does not draw the morphology background until the Field Guide opens", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("requestIdleCallback", (cb: IdleRequestCallback) => {
      cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
      return 1;
    });
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(window.navigator, "sendBeacon", { value: sendBeacon, configurable: true });
    window.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })) as typeof window.fetch;

    vi.resetModules();
    installMatchMedia();
    document.body.innerHTML = FIXTURE;
    window.history.replaceState(null, "", "/");

    await import("../../src/main.ts");

    expect(diagramState.backgroundDraws).toBe(0);

    vi.runOnlyPendingTimers();

    expect(diagramState.initCalls).toBeGreaterThanOrEqual(1);
    expect(diagramState.backgroundDraws).toBe(0);

    document.getElementById("guide-toggle")?.click();

    expect(diagramState.backgroundDraws).toBe(1);
    vi.useRealTimers();
  });
});
