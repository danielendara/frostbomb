#!/usr/bin/env node
/**
 * Headless Chrome: longest long task from index-*.js during load.
 */
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--headless=new",
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  deviceScaleFactor: 2,
});
await context.addInitScript(() => {
  Object.defineProperty(navigator, "deviceMemory", { value: 2, configurable: true });
  Object.defineProperty(navigator, "hardwareConcurrency", { value: 2, configurable: true });
});
const page = await context.newPage();
await page.addInitScript(() => {
  window.__longTasks = [];
  const obs = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      window.__longTasks.push({
        start: e.startTime,
        duration: e.duration,
        name: e.name,
      });
    }
  });
  obs.observe({ type: "longtask", buffered: true });
});

await page.goto(url, { waitUntil: "load", timeout: 120_000 });
await page.waitForFunction(
  () => document.querySelector("#scene")?.getAttribute("data-scene-nonblank") === "true",
  { timeout: 60_000 },
);
await page.waitForTimeout(2000);

const tasks = await page.evaluate(() => window.__longTasks);
const indexTasks = tasks.filter((t) => true); // attribution not in longtask API easily

const longest = tasks.reduce((a, b) => (b.duration > (a?.duration ?? 0) ? b : a), null);
console.log(JSON.stringify({ taskCount: tasks.length, longest, top5: [...tasks].sort((a, b) => b.duration - a.duration).slice(0, 5) }, null, 2));

await browser.close();
