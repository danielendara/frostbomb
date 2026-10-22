/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({ failPane: false }));

vi.mock("../../src/snowflake/scene", () => ({
  createScene: async () => ({
    start: vi.fn(),
    prepareForFirstFrame: async () => {},
    dispose: vi.fn(),
    isAutoRotateEnabled: false,
    isPinkModeEnabled: false,
    isPrismModeEnabled: false,
    setAutoRotate: vi.fn(),
    setPinkMode: vi.fn(),
    setPrismMode: vi.fn(),
    setPhotoMode: vi.fn(),
    updateFlake: vi.fn(),
    updateFlakeAsync: vi.fn(async () => {}),
    resetView: vi.fn(),
    rotateView: vi.fn(),
  }),
}));

// happy-dom has no WebGL2; this suite exercises the mocked-scene path.
vi.mock("../../src/snowflake/webgl-fallback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/snowflake/webgl-fallback")>()),
  hasWebGL2: () => true,
}));

vi.mock("tweakpane", () => ({
  Pane: class {
    constructor() {
      if (gate.failPane) throw new Error("simulated chunk load failure");
    }
    addBinding() {
      return { on: () => this };
    }
    addButton() {
      return { on: () => this };
    }
    refresh() {}
  },
}));

const FIXTURE = `
  <canvas id="scene"></canvas>
  <div id="a11y-announcer"></div>
  <button id="lab-toggle" aria-pressed="false" aria-expanded="false">
    Lab Mode: <span id="lab-status">OFF</span>
  </button>
  <div id="stats-display"></div>
  <div id="recent-seeds-container"><div id="recent-seeds-list"></div></div>
  <button id="btn-clear-history">Clear</button>
  <div id="lab-controls" style="display: none;" tabindex="-1">
    <div id="pane-mount"></div>
    <button id="lab-close" type="button">Close Lab Mode</button>
  </div>
  <canvas id="nakaya-diagram" aria-pressed="false" aria-expanded="false"></canvas>
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

/**
 * The Lab Mode failure path reports a `chunk-load` client error. Stub the
 * transport before `main.ts` installs the reporter so nothing reaches the
 * network (happy-dom would otherwise fetch http://localhost:3000).
 */
function stubClientErrorTransport() {
  const sendBeacon = vi.fn((_url: string, _data?: BodyInit | null) => true);
  Object.defineProperty(window.navigator, "sendBeacon", { value: sendBeacon, configurable: true, writable: true });
  window.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })) as unknown as typeof window.fetch;
  return { sendBeacon };
}

afterEach(() => {
  window.fetch = realFetch;
  if (realSendBeacon) Object.defineProperty(window.navigator, "sendBeacon", realSendBeacon);
  else delete (window.navigator as { sendBeacon?: unknown }).sendBeacon;
  vi.restoreAllMocks();
});

async function boot() {
  vi.resetModules();
  installMatchMedia();
  const transport = stubClientErrorTransport();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  document.body.innerHTML = FIXTURE;
  const announcer = await import("../../src/ui/announcer");
  const announce = vi.spyOn(announcer, "announce");
  const { installFrostbomb, runDeferredBoot } = await import("../../src/app.ts");
  installFrostbomb();
  await runDeferredBoot();
  return { announce, ...transport };
}

function labToggle() {
  return document.getElementById("lab-toggle") as HTMLButtonElement;
}

function labControls() {
  return document.getElementById("lab-controls") as HTMLElement;
}

function labStatus() {
  return document.getElementById("lab-status") as HTMLElement;
}

const MODE_PREFS_KEY = "frostbomb-mode-prefs";

describe("Lab Mode pref persistence", () => {
  it("writes lab=true to localStorage before ensurePane resolves", async () => {
    gate.failPane = false;
    await boot();

    labToggle().click();
    const stored = JSON.parse(localStorage.getItem(MODE_PREFS_KEY) || "{}");
    expect(stored.lab).toBe(true);
    expect(labToggle().getAttribute("aria-pressed")).toBe("true");

    await vi.waitFor(() => {
      expect(labStatus().textContent).toBe("ON");
    });
  });
});

describe("Lab Mode load failure", () => {
  it("hides the controls, resets the toggle, and focuses it when ensurePane rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    gate.failPane = true;
    const { announce, sendBeacon } = await boot();

    labToggle().click();
    await vi.waitFor(() => {
      expect(announce).toHaveBeenCalledWith("Failed to load Lab Mode controls");
    });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe("/api/client-error");
    expect(await (sendBeacon.mock.calls[0][1] as Blob).text()).toContain('"kind":"chunk-load"');
    expect(window.fetch).not.toHaveBeenCalled();

    expect(labControls().style.display).toBe("none");
    expect(labToggle().getAttribute("aria-pressed")).toBe("false");
    expect(labToggle().getAttribute("aria-expanded")).toBe("false");
    expect(labToggle().disabled).toBe(false);
    expect(labStatus().textContent).toBe("ERROR");
    expect(labStatus().classList.contains("btn--error")).toBe(true);
    expect(document.activeElement).toBe(labToggle());
    expect(document.getElementById("recent-seeds-container")?.style.display).not.toBe("none");
    const diagram = document.getElementById("nakaya-diagram");
    expect(diagram?.getAttribute("aria-pressed")).toBe("false");
    expect(diagram?.getAttribute("aria-expanded")).toBe("false");
  });

  it("loads the pane on the next open and clears the error class", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    gate.failPane = true;
    const { announce } = await boot();

    labToggle().click();
    await vi.waitFor(() => {
      expect(labStatus().textContent).toBe("ERROR");
    });

    gate.failPane = false;
    announce.mockClear();
    labToggle().click();
    await vi.waitFor(() => {
      expect(labStatus().textContent).toBe("ON");
    });

    expect(labControls().style.display).toBe("flex");
    expect(labStatus().classList.contains("btn--error")).toBe(false);
    expect(labToggle().getAttribute("aria-pressed")).toBe("true");
    expect(labToggle().getAttribute("aria-expanded")).toBe("true");
    expect(announce).not.toHaveBeenCalledWith("Failed to load Lab Mode controls");
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(labControls());
    });
  });

  it("shows and focuses the controls on success, and close still hides them", async () => {
    gate.failPane = false;
    const { announce } = await boot();

    labToggle().click();
    await vi.waitFor(() => {
      expect(labStatus().textContent).toBe("ON");
    });
    expect(labControls().style.display).toBe("flex");
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(labControls());
    });
    expect(labStatus().classList.contains("btn--error")).toBe(false);
    expect(announce).toHaveBeenCalledWith("Lab Mode active");
    expect(announce).not.toHaveBeenCalledWith("Failed to load Lab Mode controls");

    document.getElementById("lab-close")!.click();
    expect(labControls().style.display).toBe("none");
    expect(labToggle().getAttribute("aria-pressed")).toBe("false");
    expect(labToggle().getAttribute("aria-expanded")).toBe("false");
    expect(labStatus().textContent).toBe("OFF");
    expect(document.activeElement).toBe(labToggle());
    expect(announce).toHaveBeenCalledWith("Lab Mode disabled");
  });
});
