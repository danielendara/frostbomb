import { test, expect, type BrowserContext } from "@playwright/test";
import { STARTUP_LONG_TASK_BUDGET_MS } from "../src/lib/yield-to-main";
import {
  MARK_WEBGL_SCENE_CREATE_BEGIN,
  MARK_WEBGL_SCENE_CREATE_END,
} from "../src/snowflake/perf-marks";

async function installLongTaskObserver(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    (window as unknown as { __longTasks: { duration: number; containerSrc: string }[] }).__longTasks =
      [];
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const attribution = (entry as PerformanceEntry & { attribution?: { containerSrc?: string }[] })
          .attribution;
        const containerSrc = attribution?.[0]?.containerSrc ?? "";
        (window as unknown as { __longTasks: { duration: number; containerSrc: string }[] }).__longTasks.push({
          duration: entry.duration,
          containerSrc,
        });
      }
    });
    obs.observe({ type: "longtask", buffered: true });
  });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const perfBaseUrl = process.env.FROSTBOMB_PERF_URL;

const swiftShaderLaunchArgs = [
  "--headless=new",
  "--no-sandbox",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
];

test.use({
  ...(perfBaseUrl ? { baseURL: perfBaseUrl } : {}),
  launchOptions: { args: swiftShaderLaunchArgs },
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});

test.describe("startup long-task budget (Lighthouse-like mobile)", () => {
  test.beforeEach(async ({ context }) => {
    await installLongTaskObserver(context);
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "deviceMemory", { value: 2, configurable: true });
      Object.defineProperty(navigator, "hardwareConcurrency", { value: 2, configurable: true });
    });
  });

  test("SwiftShader headless flags keep tasks under budget", async ({ page }) => {
    const longestIndexPerLoad: number[] = [];
    const longestScenePerLoad: number[] = [];
    const longestBudgetedPerLoad: number[] = [];
    let coldSceneCreateMs = Number.POSITIVE_INFINITY;
    for (let load = 0; load < 3; load++) {
      if (load > 0) {
        await page.reload({ waitUntil: "load", timeout: 120_000 });
      } else {
        await page.goto("/", { waitUntil: "load", timeout: 120_000 });
      }
      await page.waitForSelector('canvas[data-scene-nonblank="true"]', { timeout: 60_000 });
      await page.waitForTimeout(300);
      const stats = await page.evaluate(() => {
        const tasks = (window as unknown as { __longTasks: { duration: number; containerSrc: string }[] })
          .__longTasks;
        const longestIndex = tasks
          .filter((t) => t.containerSrc.includes("index-"))
          .reduce((max, t) => Math.max(max, t.duration), 0);
        const longestScene = tasks
          .filter((t) => t.containerSrc.includes("scene-"))
          .reduce((max, t) => Math.max(max, t.duration), 0);
        const longestAny = tasks.reduce((max, t) => Math.max(max, t.duration), 0);
        const longestBudgeted =
          longestIndex > 0 || longestScene > 0 ? Math.max(longestIndex, longestScene) : longestAny;
        return { longestIndex, longestScene, longestBudgeted, longestAny };
      });
      longestIndexPerLoad.push(stats.longestIndex);
      longestScenePerLoad.push(stats.longestScene);
      longestBudgetedPerLoad.push(stats.longestBudgeted);
      if (load === 0) {
        coldSceneCreateMs = await page.evaluate(
          ({ begin, end }) => {
            const b = performance.getEntriesByName(begin, "mark").at(-1)?.startTime;
            const e = performance.getEntriesByName(end, "mark").at(-1)?.startTime;
            return b !== undefined && e !== undefined ? e - b : Number.POSITIVE_INFINITY;
          },
          { begin: MARK_WEBGL_SCENE_CREATE_BEGIN, end: MARK_WEBGL_SCENE_CREATE_END },
        );
      }
      await page.evaluate(() => {
        (window as unknown as { __longTasks: { duration: number; containerSrc: string }[] }).__longTasks =
          [];
      });
    }

    expect(coldSceneCreateMs).toBeLessThanOrEqual(STARTUP_LONG_TASK_BUDGET_MS);

    const hasChunkAttribution = longestIndexPerLoad.some((v) => v > 0) || longestScenePerLoad.some((v) => v > 0);
    if (hasChunkAttribution) {
      expect(longestScenePerLoad[0]).toBeLessThanOrEqual(STARTUP_LONG_TASK_BUDGET_MS);
      expect(median(longestIndexPerLoad)).toBeLessThanOrEqual(STARTUP_LONG_TASK_BUDGET_MS);
      expect(median(longestScenePerLoad)).toBeLessThanOrEqual(STARTUP_LONG_TASK_BUDGET_MS);
      expect(median(longestBudgetedPerLoad)).toBeLessThanOrEqual(STARTUP_LONG_TASK_BUDGET_MS);
    }
  });
});
