#!/usr/bin/env node
/**
 * 3-run median longest long task during load (SwiftShader + slow-CPU emulation).
 * Usage: node scripts/compare-startup-long-tasks.mjs <url> [label]
 */
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const label = process.argv[3] ?? "run";

const useSwiftShader = process.argv.includes("--swiftshader");
const browser = await chromium.launch({
  headless: true,
  args: useSwiftShader
    ? [
        "--headless=new",
        "--no-sandbox",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
      ]
    : ["--headless=new", "--no-sandbox"],
});

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  deviceScaleFactor: 2,
});

await context.addInitScript(() => {
  Object.defineProperty(navigator, "deviceMemory", { value: 2, configurable: true });
  Object.defineProperty(navigator, "hardwareConcurrency", { value: 2, configurable: true });
  window.__longTasks = [];
  const obs = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const attribution = entry.attribution;
      const containerSrc = attribution?.[0]?.containerSrc ?? "";
      window.__longTasks.push({ duration: entry.duration, containerSrc });
    }
  });
  obs.observe({ type: "longtask", buffered: true });
});

const page = await context.newPage();

const longestPerLoad = [];
const indexPerLoad = [];
const scenePerLoad = [];

for (let load = 0; load < 3; load++) {
  if (load > 0) await page.reload({ waitUntil: "load", timeout: 120_000 });
  else await page.goto(url, { waitUntil: "load", timeout: 120_000 });

  await page
    .waitForSelector('[data-boot="ready"]', { timeout: 8_000 })
    .catch(() =>
      page.waitForFunction(
        () => {
          const el = document.getElementById("seed-display");
          return Boolean(el?.textContent && el.textContent !== "·····");
        },
        undefined,
        { timeout: 120_000 },
      ),
    );
  await page
    .waitForSelector('canvas[data-scene-nonblank="true"]', { timeout: 120_000 })
    .catch(() => page.waitForTimeout(2000));
  await page.waitForTimeout(400);

  const stats = await page.evaluate(() => {
    const tasks = window.__longTasks;
    const longest = tasks.reduce((m, t) => Math.max(m, t.duration), 0);
    const longestIndex = tasks
      .filter((t) => (t.containerSrc ?? "").includes("index-"))
      .reduce((m, t) => Math.max(m, t.duration), 0);
    const longestScene = tasks
      .filter((t) => (t.containerSrc ?? "").includes("scene-"))
      .reduce((m, t) => Math.max(m, t.duration), 0);
    return { longest, longestIndex, longestScene, count: tasks.length };
  });
  longestPerLoad.push(stats.longest);
  indexPerLoad.push(stats.longestIndex);
  scenePerLoad.push(stats.longestScene);
  await page.evaluate(() => {
    window.__longTasks = [];
  });
}

const summary = {
  label,
  url,
  cpuThrottleRate: 6,
  medianLongest: median(longestPerLoad),
  medianLongestIndex: median(indexPerLoad),
  medianLongestScene: median(scenePerLoad),
  loads: longestPerLoad,
};
console.log(JSON.stringify(summary, null, 2));
await browser.close();
