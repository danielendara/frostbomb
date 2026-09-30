/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_ERROR_ENDPOINT,
  CLIENT_ERROR_MAX_REPORTS,
  buildClientErrorReport,
  buildIdFromModuleUrl,
  createClientErrorReporter,
  installClientErrorReporting,
  locationFromStack,
  reportClientError,
  sanitizeSource,
  stripUrlParams,
  uaFamily,
} from "../../src/ui/client-error";

const origin = "https://frostbomb.com";
const context = { build: "index-abc123", ua: "chrome" as const, origin };

async function blobJson(blob: Blob): Promise<unknown> {
  return JSON.parse(await blob.text());
}

function reporterWithBeacon(result = true) {
  const sendBeacon = vi.fn((_url: string, _data: Blob) => result);
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => undefined);
  const reporter = createClientErrorReporter({ ...context, transport: { sendBeacon, fetch } });
  return { reporter, sendBeacon, fetch };
}

describe("client error report payload (#356)", () => {
  it("contains only allowlisted fields", () => {
    const error = new Error("boom");
    error.stack = `Error: boom\n    at run (${origin}/assets/index-abc123.js?v=2#frag:12:34)`;
    const report = buildClientErrorReport("error", error, context);

    expect(Object.keys(report).sort()).toEqual(["build", "col", "kind", "line", "message", "source", "ua"]);
    expect(report).toEqual({
      kind: "error",
      message: "boom",
      source: "/assets/index-abc123.js",
      line: 12,
      col: 34,
      build: "index-abc123",
      ua: "chrome",
    });
  });

  it("truncates messages to 300 chars and strips URL query strings and fragments", () => {
    const long = buildClientErrorReport("error", "x".repeat(400), context);
    expect(long.message).toHaveLength(300);

    const withUrl = buildClientErrorReport(
      "chunk-load",
      new Error(`Failed to fetch dynamically imported module: ${origin}/assets/lab-1.js?seed=secret#look=pink`),
      context,
    );
    expect(withUrl.message).toBe(`Failed to fetch dynamically imported module: ${origin}/assets/lab-1.js`);
    expect(withUrl.message).not.toContain("seed");
  });

  it("keeps only same-origin script paths", () => {
    expect(sanitizeSource(`${origin}/assets/a.js?x=1`, origin)).toBe("/assets/a.js");
    expect(sanitizeSource("chrome-extension://abc/content.js", origin)).toBe("external");
    expect(sanitizeSource(undefined, origin)).toBeUndefined();
  });

  it("drops line/col without a source and ignores invalid positions", () => {
    const report = buildClientErrorReport("error", "bad", { ...context, location: { line: 3, col: 4 } });
    expect(report).not.toHaveProperty("line");
    const negative = buildClientErrorReport("error", "bad", {
      ...context,
      location: { source: "/a.js", line: -1, col: 1.5 },
    });
    expect(negative).toEqual({ kind: "error", message: "bad", source: "/a.js", build: "index-abc123", ua: "chrome" });
  });

  it("parses stack frames and non-Error reasons", () => {
    expect(locationFromStack(`at x (${origin}/assets/a.js:1:2)`)).toEqual({ source: `${origin}/assets/a.js`, line: 1, col: 2 });
    expect(locationFromStack("f@/assets/b.js:5:6")).toEqual({ source: "/assets/b.js", line: 5, col: 6 });
    expect(locationFromStack(undefined)).toEqual({});
    expect(buildClientErrorReport("unhandledrejection", { message: "obj" }, context).message).toBe("obj");
    expect(buildClientErrorReport("unhandledrejection", 42, context).message).toBe("Unknown error");
  });

  it("maps user agents to coarse families", () => {
    expect(uaFamily("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0")).toBe("edge");
    expect(uaFamily("Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/140.0")).toBe("firefox");
    expect(uaFamily("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/19.0 Safari/605.1.15")).toBe("safari");
    expect(uaFamily("Mozilla/5.0 (iPhone) CriOS/140.0 Mobile Safari/604.1")).toBe("chrome");
    expect(uaFamily("curl/8")).toBe("other");
  });

  it("derives the build id from the hashed bundle name", () => {
    expect(buildIdFromModuleUrl(`${origin}/assets/index-61FAqeWf.js`)).toBe("index-61FAqeWf");
    expect(buildIdFromModuleUrl("not a url")).toBe("unknown");
  });

  it("strips params from bare paths too", () => {
    expect(stripUrlParams("GET /assets/x.js?seed=1 failed")).toBe("GET /assets/x.js failed");
  });
});

describe("client error reporter", () => {
  it("sends one beacon per event to the endpoint", async () => {
    const { reporter, sendBeacon, fetch } = reporterWithBeacon();

    expect(reporter.report("export", new Error("disk full"))).toBe(true);

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0]![0]).toBe(CLIENT_ERROR_ENDPOINT);
    expect(await blobJson(sendBeacon.mock.calls[0]![1])).toMatchObject({ kind: "export", message: "disk full" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to fetch keepalive when the beacon is refused", () => {
    const { reporter, fetch } = reporterWithBeacon(false);

    reporter.report("frost-worker", "worker died");

    expect(fetch).toHaveBeenCalledWith(
      CLIENT_ERROR_ENDPOINT,
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
  });

  it("dedupes identical reports", () => {
    const { reporter, sendBeacon } = reporterWithBeacon();

    reporter.report("postprocessing", "load failed");
    reporter.report("postprocessing", "load failed");
    reporter.report("postprocessing", "other failure");

    expect(sendBeacon).toHaveBeenCalledTimes(2);
  });

  it(`caps sends at ${CLIENT_ERROR_MAX_REPORTS} per page load`, () => {
    const { reporter, sendBeacon } = reporterWithBeacon();

    for (let i = 0; i < 20; i++) reporter.report("error", `error ${i}`);

    expect(sendBeacon).toHaveBeenCalledTimes(CLIENT_ERROR_MAX_REPORTS);
    expect(reporter.sent()).toBe(CLIENT_ERROR_MAX_REPORTS);
  });

  it("never throws when the transport throws", () => {
    const reporter = createClientErrorReporter({
      ...context,
      transport: {
        sendBeacon: () => {
          throw new Error("nope");
        },
      },
    });
    expect(() => reporter.report("error", "x")).not.toThrow();
  });
});

describe("installClientErrorReporting", () => {
  let uninstall: (() => void) | undefined;

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
    vi.restoreAllMocks();
  });

  it("reports window errors, unhandled rejections, and handled failures", async () => {
    const sendBeacon = vi.fn((_url: string, _data: Blob) => true);
    Object.defineProperty(window.navigator, "sendBeacon", { configurable: true, value: sendBeacon });

    reportClientError("export", "before install is ignored");
    expect(sendBeacon).not.toHaveBeenCalled();

    uninstall = installClientErrorReporting(window);
    window.dispatchEvent(
      new ErrorEvent("error", { message: "uncaught", filename: `${window.location.origin}/assets/a.js?x=1`, lineno: 7, colno: 9 }),
    );
    const rejection = new Event("unhandledrejection") as Event & { reason: unknown };
    rejection.reason = new Error("rejected");
    window.dispatchEvent(rejection);
    reportClientError("webgl-context-lost", "WebGL context lost");

    const reports = await Promise.all(sendBeacon.mock.calls.map(([, blob]) => blobJson(blob)));
    expect(reports).toEqual([
      expect.objectContaining({ kind: "error", message: "uncaught", source: "/assets/a.js", line: 7, col: 9 }),
      expect.objectContaining({ kind: "unhandledrejection", message: "rejected" }),
      expect.objectContaining({ kind: "webgl-context-lost", message: "WebGL context lost" }),
    ]);

    uninstall();
    uninstall = undefined;
    reportClientError("export", "after uninstall is ignored");
    expect(sendBeacon).toHaveBeenCalledTimes(3);
  });
});
