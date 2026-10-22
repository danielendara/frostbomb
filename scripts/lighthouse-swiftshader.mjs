#!/usr/bin/env node
/**
 * Lighthouse mobile (SwiftShader) — 3 runs, median score/LCP/TBT + longest long tasks
 * attributed to index-*.js and scene-*.js (when attribution is available).
 *
 * Usage:
 *   node scripts/lighthouse-swiftshader.mjs [--url=http://127.0.0.1:4173/] [--runs=3] [--label=main]
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:4173/";
const runs = Number(args.find((a) => a.startsWith("--runs="))?.slice(7) ?? "3");
const label = args.find((a) => a.startsWith("--label="))?.slice(8) ?? "run";

const chromeFlags = [
  "--headless=new",
  "--no-sandbox",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
].join(" ");

const outDir = join(process.cwd(), ".perf-lighthouse", label);
mkdirSync(outDir, { recursive: true });

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const lhResults = [];

for (let i = 0; i < runs; i++) {
  const jsonPath = join(outDir, `lh-${i}.json`);
  const r = spawnSync(
    "npx",
    [
      "lighthouse",
      url,
      "--quiet",
      "--chrome-flags=" + chromeFlags,
      "--only-categories=performance",
      "--preset=perf",
      "--output=json",
      `--output-path=${jsonPath}`,
      "--form-factor=mobile",
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  const report = JSON.parse(readFileSync(jsonPath, "utf8"));
  lhResults.push({
    score: report.categories.performance.score * 100,
    lcp: report.audits["largest-contentful-paint"]?.numericValue ?? null,
    tbt: report.audits["total-blocking-time"]?.numericValue ?? null,
  });
}

async function measureLongTasks() {
  const browser = await chromium.launch({
    headless: true,
    args: chromeFlags.split(" "),
  });
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
        window.__longTasks.push({
          duration: entry.duration,
          containerSrc,
        });
      }
    });
    obs.observe({ type: "longtask", buffered: true });
  });

  const taskRuns = [];
  for (let i = 0; i < runs; i++) {
    const page = await context.newPage();
    if (i > 0) await page.reload({ waitUntil: "load", timeout: 120_000 });
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
    await page.waitForTimeout(400);
    const stats = await page.evaluate(() => {
      const tasks = window.__longTasks;
      const longest = tasks.reduce((a, b) => (b.duration > (a?.duration ?? 0) ? b : a), { duration: 0 });
      const longestIndex = tasks
        .filter((t) => (t.containerSrc ?? "").includes("index-") || (t.containerSrc ?? "").includes("/index"))
        .reduce((m, t) => Math.max(m, t.duration), 0);
      const longestScene = tasks
        .filter((t) => (t.containerSrc ?? "").includes("scene-"))
        .reduce((m, t) => Math.max(m, t.duration), 0);
      return { longest: longest.duration, longestIndex, longestScene, count: tasks.length };
    });
    taskRuns.push(stats);
    await page.close();
  }
  await browser.close();
  return taskRuns;
}

const taskRuns = await measureLongTasks();

const summary = {
  label,
  url,
  runs,
  medianScore: median(lhResults.map((r) => r.score)),
  medianLcp: median(lhResults.map((r) => r.lcp ?? 0)),
  medianTbt: median(lhResults.map((r) => r.tbt ?? 0)),
  medianLongestTask: median(taskRuns.map((t) => t.longest)),
  medianLongestIndexTask: median(taskRuns.map((t) => t.longestIndex)),
  medianLongestSceneTask: median(taskRuns.map((t) => t.longestScene)),
  lighthouse: lhResults,
  longTasks: taskRuns,
};

writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
