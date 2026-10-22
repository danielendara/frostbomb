import { test, expect, type BrowserContext } from "@playwright/test";
import { STARTUP_LONG_TASK_BUDGET_MS } from "../src/lib/yield-to-main";

async function installLongTaskObserver(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    (window as unknown as { __longTasks: { duration: number }[] }).__longTasks = [];
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        (window as unknown as { __longTasks: { duration: number }[] }).__longTasks.push({
          duration: entry.duration,
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

test.describe("startup long-task budget (Lighthouse-like mobile)", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });

  test.beforeEach(async ({ context }) => {
    await installLongTaskObserver(context);
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "deviceMemory", { value: 2, configurable: true });
      Object.defineProperty(navigator, "hardwareConcurrency", { value: 2, configurable: true });
    });
  });

  test("SwiftShader headless flags keep tasks under budget", async ({ page }) => {
    const longestPerLoad: number[] = [];
    for (let load = 0; load < 3; load++) {
      if (load > 0) {
        await page.reload({ waitUntil: "load", timeout: 120_000 });
      } else {
        await page.goto("/", { waitUntil: "load", timeout: 120_000 });
      }
      await page.waitForSelector('canvas[data-scene-nonblank="true"]', { timeout: 60_000 });
      await page.waitForTimeout(300);
      const longest = await page.evaluate(() => {
        const tasks = (window as unknown as { __longTasks: { duration: number }[] }).__longTasks;
        return tasks.reduce((max, t) => Math.max(max, t.duration), 0);
      });
      longestPerLoad.push(longest);
      await page.evaluate(() => {
        (window as unknown as { __longTasks: { duration: number }[] }).__longTasks = [];
      });
    }

    const medianLongest = median(longestPerLoad);
    expect(medianLongest).toBeLessThanOrEqual(STARTUP_LONG_TASK_BUDGET_MS);
  });
});
