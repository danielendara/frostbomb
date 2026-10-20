// Flash measurement for #442: QUALITY=rich|lite (env, default rich), SEED=<seed> (env, default fox), desktop, auto-rotate on, 10 s at a virtual 60 fps.
// usage: node flash.mjs <base-url> <out.json> [frames=600] [width=1440] [height=900] [dpr=2]
// The page's requestAnimationFrame is taken over after the entry tween settles, so each call below
// advances exactly 1/60 s of app time whatever the software renderer manages in real time.
// Per frame the canvas is read back and reduced to the mean luma (Rec.709 on the 8-bit output,
// 0..1) of every 2x2 device-pixel tile (1 CSS px at DPR 2, about a glint). Glint areas = the 5
// tiles with the highest peak over the run, at least 6 tiles apart. A crossing is a frame where a
// tile's luma moves across a fixed threshold, either direction (raw), or across it by more than a
// 0.05 band (debounced); reported for 0.74 / 0.84 / 0.94: a 2x2 tile's mean sits on one of five levels (0.58 surface, then +0.105
// per glint pixel up to 1.0), so thresholds midway between levels keep a steady pixel from hovering on T. The
// flake surface tops out near 0.64 and the snow is parked, so only glints (and rim highlights)
// reach the thresholds. Tiles under 0.66 are not stored: they cannot cross.
import { chromium } from "/workspace/fb442-proof/after2/node_modules/@playwright/test/index.mjs";
import { writeFileSync } from "node:fs";

const [base, out, framesArg = "600", wArg = "1440", hArg = "900", dprArg = "2"] = process.argv.slice(2);
const FRAMES = Number(framesArg), W = Number(wArg), H = Number(hArg), DPR = Number(dprArg);
const FPS = 60, TILE = 2, THRESHOLDS = [0.74, 0.84, 0.94], RECORD_FROM = 0.66, BAND = 0.05; // 0.66 < T - BAND for the lowest T (0.69), so unrecorded (zero) tiles are "off" either way

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
const page = await ctx.newPage();
await page.addInitScript(() => {
  // Park the 200 snowfall particles off-screen (their positions are Math.random draws, x/y = (r - 0.5) * 20):
  // they are bright, fast, one-frame specks that would otherwise rank as the "brightest glint areas".
  Math.random = () => 0.999;
  const orig = window.requestAnimationFrame.bind(window);
  const s = (window.__vt = { manual: false, queue: [], t: 0 });
  window.requestAnimationFrame = (cb) => {
    if (s.manual) { s.queue.push(cb); return s.queue.length; }
    return orig((ts) => { s.t = ts; cb(ts); });
  };
});
const QUALITY = process.env.QUALITY ?? "rich", SEED = process.env.SEED ?? "fox";
await page.goto(`${base}/?seed=${SEED}&quality=${QUALITY}`); // auto-rotate left on (no rotate=0)
await page.waitForSelector('canvas[data-entry-active="false"]', { timeout: 120000 });
if (QUALITY === "rich") await page.waitForFunction(() => performance.getEntriesByName("frostbomb:postprocessing-ready").length > 0, null, { timeout: 60000 });
else await page.waitForTimeout(15000); // LITE: no postprocessing; let the frost bake land
const info = await page.evaluate(() => ({
  tier: document.querySelector("canvas").dataset.quality,
  glint: document.querySelector("canvas").dataset.glint,
  autoRotatePressed: document.querySelector("#btn-rotate")?.getAttribute("aria-pressed"),
}));
// Take over the clock and wait for the in-flight real frame to queue the next one.
await page.evaluate(() => { window.__vt.manual = true; });
await page.waitForFunction(() => window.__vt.queue.length > 0, null, { timeout: 120000 });

const result = await page.evaluate(
  async ({ FRAMES, FPS, TILE, THRESHOLDS, RECORD_FROM, BAND }) => {
    const s = window.__vt;
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const w = canvas.width, h = canvas.height;
    const tw = Math.floor(w / TILE), th = Math.floor(h / TILE);
    const px = new Uint8Array(w * h * 4);
    // Sparse series: only tiles that ever reach RECORD_FROM are kept (everything else sits at the
    // flake surface, <= 0.64, or the dark background, and can never cross a threshold >= 0.7).
    const series = new Map();
    const t0 = s.t;
    const norm = 1 / (TILE * TILE * 255);
    for (let f = 0; f < FRAMES; f++) {
      s.t = t0 + ((f + 1) * 1000) / FPS;
      for (const cb of s.queue.splice(0)) cb(s.t);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      for (let ty = 0; ty < th; ty++) {
        for (let tx = 0; tx < tw; tx++) {
          let sum = 0;
          for (let dy = 0; dy < TILE; dy++) {
            let i = ((ty * TILE + dy) * w + tx * TILE) * 4;
            for (let dx = 0; dx < TILE; dx++, i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
          }
          const v = sum * norm;
          if (v >= RECORD_FROM) {
            const k = ty * tw + tx;
            let a = series.get(k);
            if (!a) series.set(k, (a = new Float32Array(FRAMES)));
            a[f] = v;
          }
        }
      }
      if (f % 50 === 0) await new Promise((r) => setTimeout(r, 0)); // let the page breathe
    }
    // Raw: the series crosses T (>= T is "on"). Debounced: a Schmitt trigger, on at >= T + BAND, off at
    // <= T - BAND, so a pixel hovering one 8-bit step around T is not counted as flashing.
    const crossings = (a, T, band = 0) => {
      const frames = []; let on = a[0] >= T;
      for (let f = 1; f < a.length; f++) {
        const now = on ? !(a[f] <= T - band) : a[f] >= T + band;
        if (now !== on) { frames.push(f); on = now; }
      }
      return frames; // frame index of each crossing, either direction
    };
    const worstWindow = (frames, n) => { let best = 0; for (let i = 0; i < frames.length; i++) { let c = 0; for (let j = i; j < frames.length && frames[j] < frames[i] + n; j++) c++; if (c > best) best = c; } return best; };
    const peakOf = (a) => { let p = 0; for (const v of a) if (v > p) p = v; return p; };
    const summarize = (k, a) => {
      let above = 0; for (const v of a) if (v >= 0.84) above++;
      const r = { tile: { x: (k % tw) * TILE, y: Math.floor(k / tw) * TILE }, peak: +peakOf(a).toFixed(3), framesAbove0_84: above, byThreshold: {}, luma: Array.from(a, (v) => +v.toFixed(2)) };
      for (const T of THRESHOLDS) {
        const one = (c) => ({ crossings: c.length, perSecondAvg: +(c.length / (a.length / FPS)).toFixed(2), worst1sWindow: worstWindow(c, FPS), perSecond: Array.from({ length: Math.ceil(a.length / FPS) }, (_, sec) => c.filter((f) => f >= sec * FPS && f < (sec + 1) * FPS).length) });
        r.byThreshold[T] = { raw: one(crossings(a, T)), debounced: one(crossings(a, T, BAND)) };
      }
      return r;
    };
    const sumOf = (a) => { let t = 0; for (const v of a) t += v; return t; };
    // Rank by total light over the run (peaks tie at 1.0 once a glint saturates).
    const ranked = [...series.entries()].map(([k, a]) => ({ k, a, peak: peakOf(a), light: sumOf(a) })).sort((x, y) => y.light - x.light);
    const picked = [];
    for (const t of ranked) {
      const x = t.k % tw, y = Math.floor(t.k / tw);
      if (picked.every((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) >= 6)) picked.push({ ...t, x, y });
      if (picked.length === 5) break;
    }
    const top5 = picked.map((p) => summarize(p.k, p.a));
    const worstAny = {};
    for (const T of THRESHOLDS) {
      let best = 0, at = null, crossed = 0;
      const hist = {}; const clusters = new Map();
      for (const [k, a] of series) {
        const c = crossings(a, T, BAND); if (c.length) crossed++;
        const wv = worstWindow(c, FPS);
        hist[Math.min(wv, 6)] = (hist[Math.min(wv, 6)] ?? 0) + 1;
        if (wv > best) { best = wv; at = { x: (k % tw) * TILE, y: Math.floor(k / tw) * TILE }; }
        if (wv >= 3) { const key = `${Math.floor(((k % tw) * TILE) / 64) * 64},${Math.floor((Math.floor(k / tw) * TILE) / 64) * 64}`; const e = clusters.get(key) ?? { tiles: 0, worst: 0 }; e.tiles++; e.worst = Math.max(e.worst, wv); clusters.set(key, e); }
      }
      const over = [...clusters.entries()].sort((x, y) => y[1].tiles - x[1].tiles).slice(0, 12).map(([key, e]) => ({ block64pxAt: key, ...e }));
      worstAny[T] = { worst1sWindowAnyTile: best, tilesWithAnyCrossing: crossed, at, tilesByWorst1sWindow: hist, tilesAtOrOver3PerSecond: [...clusters.values()].reduce((n, e) => n + e.tiles, 0), blocksWithTilesOver3: over };
    }
    // Auto-rotate check: how far the brightest tiles' positions are spread is not meaningful; instead
    // report how many tiles ever recorded (glint/highlight) so a dead scene would show as ~0.
    return { canvas: { w, h }, tiles: { tw, th }, tilesEverAbove: { threshold: RECORD_FROM, count: series.size }, top5, worstAny };
  },
  { FRAMES, FPS, TILE, THRESHOLDS, RECORD_FROM, BAND },
);
const gl = await page.evaluate(() => { const c = document.createElement("canvas").getContext("webgl"); const e = c.getExtension("WEBGL_debug_renderer_info"); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : null; });
const report = { method: { base, viewport: `${W}x${H}`, dpr: DPR, frames: FRAMES, fps: FPS, seconds: FRAMES / FPS, tilePx: TILE, recordedFrom: RECORD_FROM, debounceBand: BAND, thresholds: THRESHOLDS, luma: "Rec.709 on 8-bit output / 255", seed: "fox", autoRotate: "on (default)", particles: "parked off-screen via Math.random=0.999" }, page: info, renderer: gl, chrome: browser.version(), ...result };
writeFileSync(out, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ page: info, renderer: gl, top5: result.top5.map((t) => ({ tile: t.tile, peak: t.peak, framesAbove0_84: t.framesAbove0_84, raw: Object.fromEntries(THRESHOLDS.map((T) => [T, [t.byThreshold[T].raw.crossings, t.byThreshold[T].raw.worst1sWindow]])), debounced: Object.fromEntries(THRESHOLDS.map((T) => [T, [t.byThreshold[T].debounced.crossings, t.byThreshold[T].debounced.worst1sWindow]])) })), worstAny: result.worstAny }, null, 1));
await browser.close();
