#!/usr/bin/env node
// Rendering perf baseline: loads a seed, runs a scripted 10 s orbit, and prints
// fps, p50/p95 frame time and the first-frame mark as JSON plus a markdown row.
//
//   npm run preview                       # production build via wrangler dev (port 8787)
//   node scripts/perf-orbit.mjs --profile=desktop|low-end-mobile [--seed=fox]
//        [--quality=rich|lite] [--runs=3] [--url=http://127.0.0.1:8787] [--headed]
//
// --quality is passed as ?quality=; it is a no-op until the quality tiers (A4) land.
// Chrome throttles CPU (Emulation.setCPUThrottlingRate), not the GPU process.
// Headless Chromium usually renders WebGL with SwiftShader: on a software renderer
// the absolute fps budgets do not apply; compare before/after on one box and session.
import { chromium } from "@playwright/test";

const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, cpuThrottle: 1, touch: false },
  "low-end-mobile": { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, cpuThrottle: 6, touch: true },
};
const MARK_FIRST_FRAME_RENDERED = "frostbomb:first-frame-rendered"; // src/snowflake/perf-marks.ts
const ORBIT_MS = 10_000;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = "true"] = a.replace(/^--/, "").split("=");
    return [k, v];
  }),
);
const profileName = args.profile ?? "desktop";
const profile = PROFILES[profileName];
if (!profile) {
  console.error(`unknown --profile=${profileName}; use ${Object.keys(PROFILES).join("|")}`);
  process.exit(2);
}
const seed = args.seed ?? "fox";
const quality = args.quality;
if (quality && !["rich", "lite"].includes(quality)) {
  console.error("--quality must be rich or lite");
  process.exit(2);
}
const runs = Number(args.runs ?? 3);
const base = args.url ?? "http://127.0.0.1:8787";
const headed = args.headed === "true";

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function once(browser) {
  const ctx = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    hasTouch: profile.touch,
    isMobile: profile.touch,
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__fbFrames = [];
    window.__fbRecord = false;
    const tick = (t) => {
      if (window.__fbRecord) window.__fbFrames.push(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const cdp = await ctx.newCDPSession(page);
  const params = new URLSearchParams({ seed, rotate: "0" });
  if (quality) params.set("quality", quality);
  const url = `${base}/?${params}`;
  await page.goto(url);
  await page.waitForSelector('canvas[data-entry-active="false"]', { timeout: 60_000 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuThrottle });

  const box = await page.locator("canvas").first().boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const r = Math.min(box.width, box.height) / 4;
  await page.evaluate(() => { window.__fbRecord = true; });
  await page.mouse.move(cx + r, cy);
  await page.mouse.down();
  const start = Date.now();
  while (Date.now() - start < ORBIT_MS) {
    const a = ((Date.now() - start) / 2500) * Math.PI * 2; // one lap per 2.5 s
    await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a));
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
  const { frames, firstFrameMs, gl } = await page.evaluate((mark) => {
    window.__fbRecord = false;
    const c = document.createElement("canvas").getContext("webgl");
    const ext = c?.getExtension("WEBGL_debug_renderer_info");
    return {
      frames: window.__fbFrames,
      firstFrameMs: performance.getEntriesByName(mark)[0]?.startTime ?? null,
      gl: ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
    };
  }, MARK_FIRST_FRAME_RENDERED);
  const version = browser.version();
  await ctx.close();
  const dts = frames.slice(1).map((t, i) => t - frames[i]).sort((a, b) => a - b);
  const seconds = (frames[frames.length - 1] - frames[0]) / 1000;
  return {
    url,
    renderer: gl,
    chrome: version,
    mode: headed ? "headed" : "headless",
    fps: +(dts.length / seconds).toFixed(1),
    p50Ms: +pct(dts, 50).toFixed(1),
    p95Ms: +pct(dts, 95).toFixed(1),
    firstFrameMs: firstFrameMs === null ? null : +firstFrameMs.toFixed(0),
  };
}

const browser = await chromium.launch({ headless: !headed });
const results = [];
for (let i = 0; i < runs; i++) results.push(await once(browser));
await browser.close();

const med = (k) => (results.some((r) => r[k] === null) ? null : +median(results.map((r) => r[k])).toFixed(1));
const summary = {
  profile: profileName,
  seed,
  quality: quality ?? "default (no-op until A4)",
  url: results[0].url,
  renderer: results[0].renderer,
  softwareRenderer: /swiftshader|llvmpipe|software/i.test(results[0].renderer ?? ""),
  chrome: results[0].chrome,
  mode: results[0].mode,
  runs: results,
  median: { fps: med("fps"), p50Ms: med("p50Ms"), p95Ms: med("p95Ms"), firstFrameMs: med("firstFrameMs") },
};
console.log(JSON.stringify(summary, null, 2));
const m = summary.median;
console.log("\n| profile | quality | fps | p50 ms | p95 ms | first-frame ms | renderer |");
console.log("|---|---|---|---|---|---|---|");
console.log(`| ${profileName} | ${args.quality ?? "default"} | ${m.fps} | ${m.p50Ms} | ${m.p95Ms} | ${m.firstFrameMs} | ${summary.renderer} |`);
