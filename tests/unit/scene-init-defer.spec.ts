/** @vitest-environment happy-dom */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MARK_SCENE_INIT_BEGIN,
  markMainModuleFinished,
  resetSceneInitDeferStateForTests,
  sceneInitRanBeforeMainModuleFinished,
  scheduleDeferredSceneInit,
} from "../../src/snowflake/schedule-scene-init";
import { resetPerfMarksForTests } from "../../src/snowflake/perf-marks";

describe("scheduleDeferredSceneInit", () => {
  beforeEach(() => {
    resetSceneInitDeferStateForTests();
    resetPerfMarksForTests();
    vi.stubGlobal("requestIdleCallback", undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("runs the callback only after two animation frames", () => {
    const order: string[] = [];
    const raf = vi.fn((cb: FrameRequestCallback) => {
      order.push("raf-scheduled");
      cb(0);
      return 0;
    });
    vi.stubGlobal("requestAnimationFrame", raf);

    markMainModuleFinished();
    scheduleDeferredSceneInit(() => {
      order.push("init");
    });

    expect(order).toEqual(["raf-scheduled", "raf-scheduled", "init"]);
    expect(sceneInitRanBeforeMainModuleFinished).toBe(false);
    expect(performance.getEntriesByName(MARK_SCENE_INIT_BEGIN, "mark")).toHaveLength(1);
  });

  it("flags init that runs before markMainModuleFinished", () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    scheduleDeferredSceneInit(() => {});
    expect(sceneInitRanBeforeMainModuleFinished).toBe(true);
  });

  it("does not schedule scene work on requestIdleCallback", () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const idle = vi.fn();
    vi.stubGlobal("requestIdleCallback", idle);

    markMainModuleFinished();
    scheduleDeferredSceneInit(() => {});

    expect(idle).not.toHaveBeenCalled();
  });
});

describe("main.ts scene bootstrap contract", () => {
  const main = readFileSync("src/main.ts", "utf8");

  it("does not construct the WebGL scene during module evaluation", () => {
    expect(main).not.toMatch(/import\s*\{[^}]*\bcreateScene\b/);
    expect(main).toMatch(
      /const \{ warmSceneModule, createScene \} = await import\("\.\/snowflake\/scene"\)/,
    );
    expect(main).toMatch(/await warmSceneModule\(\)/);
    expect(main).toMatch(/scheduleDeferredSceneInit/);
    expect(main).toMatch(/markMainModuleFinished\(\)/);
  });
});

describe("index.html static first paint", () => {
  const html = readFileSync("index.html", "utf8");

  it("ships masthead and field notes in HTML before the app module runs", () => {
    expect(html).toContain('class="masthead"');
    expect(html).toContain('class="wordmark"');
    expect(html).toContain('elementtiming="lcp-wordmark"');
    expect(html).toContain('id="field-notes"');
    expect(html).toContain('href="/src/style.css"');
    const stylePos = html.indexOf("/src/style.css");
    const scriptPos = html.indexOf("/src/main.ts");
    expect(stylePos).toBeGreaterThan(-1);
    expect(scriptPos).toBeGreaterThan(stylePos);
  });
});
