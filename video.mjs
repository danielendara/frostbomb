// Deterministic orbit videos for #442. The page clock is taken over after the entry tween settles,
// so every captured frame is exactly 1/FPS s of app time even on the software renderer (which
// manages ~1 real fps at RICH). Frames are screenshotted, then encoded with ffmpeg (webm / VP9).
// usage: node video.mjs <base-url> <rich|lite|reduced> <out.webm> [seed=charlie] [seconds=5] [fps=24]
import { chromium } from "/workspace/fb442-proof/after2/node_modules/@playwright/test/index.mjs";
import { mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const [base, mode, out, seed = "charlie", secArg = "5", fpsArg = "24"] = process.argv.slice(2);
const SECONDS = Number(secArg), FPS = Number(fpsArg), FRAMES = SECONDS * FPS;
const IDLE = Math.round(FRAMES * 0.4); // idle first (auto-rotate only; nothing at all under reduced motion), then a drag orbit
const dir = `${out}.frames`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 800, height: 520 }, deviceScaleFactor: 2, reducedMotion: mode === "reduced" ? "reduce" : "no-preference" });
const page = await ctx.newPage();
await page.addInitScript(() => {
  const orig = window.requestAnimationFrame.bind(window);
  const s = (window.__vt = { manual: false, queue: [], t: 0 });
  window.requestAnimationFrame = (cb) => {
    if (s.manual) { s.queue.push(cb); return s.queue.length; }
    return orig((ts) => { s.t = ts; cb(ts); });
  };
});
const quality = mode === "rich" ? "rich" : "lite"; // reduced motion forces LITE whatever is asked
await page.goto(`${base}/?seed=${seed}&quality=${quality}`);
await page.waitForSelector('canvas[data-entry-active="false"]', { timeout: 120000 });
if (mode === "rich") await page.waitForFunction(() => performance.getEntriesByName("frostbomb:postprocessing-ready").length > 0, null, { timeout: 60000 });
await page.evaluate(() => { document.activeElement?.blur?.(); window.__vt.manual = true; });
// Under reduced motion the app renders on demand (no idle rAF loop), so an empty queue is expected there.
if (mode !== "reduced") await page.waitForFunction(() => window.__vt.queue.length > 0, null, { timeout: 120000 });
const state = await page.evaluate(() => { const c = document.querySelector("canvas"); return { tier: c.dataset.quality, glint: c.dataset.glint, rotatePressed: document.querySelector("#btn-rotate")?.getAttribute("aria-pressed") }; });
console.log(mode, JSON.stringify(state));

const cx = 400, cy = 260;
await page.mouse.move(cx + 120, cy);
for (let f = 0; f < FRAMES; f++) {
  if (f === IDLE) await page.mouse.down();
  if (f >= IDLE) {
    const a = ((f - IDLE) / (FRAMES - IDLE)) * Math.PI * 1.5; // three quarters of a lap
    await page.mouse.move(cx + 120 * Math.cos(a), cy + 70 * Math.sin(a));
  }
  await page.evaluate((dt) => { const s = window.__vt; s.t += dt; for (const cb of s.queue.splice(0)) cb(s.t); }, 1000 / FPS);
  await page.screenshot({ path: `${dir}/f${String(f).padStart(4, "0")}.png`, clip: { x: 80, y: 40, width: 640, height: 440 } });
}
await page.mouse.up();
await browser.close();
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${dir}/f%04d.png`, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-pix_fmt", "yuv420p", out]);
rmSync(dir, { recursive: true, force: true });
console.log("wrote", out);
