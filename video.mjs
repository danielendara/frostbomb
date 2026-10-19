import { chromium } from "/workspace/frostbomb-441-2026-10-19/frostbomb/node_modules/@playwright/test/index.mjs";
import { mkdirSync } from "node:fs";
const tier = process.argv[2];
mkdirSync("/tmp/fb441/video-raw", { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 800, height: 520 }, recordVideo: { dir: "/tmp/fb441/video-raw", size: { width: 800, height: 520 } } });
const p = await ctx.newPage();
await p.goto(`http://127.0.0.1:8788/?seed=charlie&rotate=0&quality=${tier}`);
await p.waitForSelector('canvas[data-entry-active="false"]', { timeout: 60000 });
console.log("quality attr:", await p.getAttribute("canvas", "data-quality"));
const t0 = Date.now();
await p.mouse.move(300, 260); await p.mouse.down();
while (Date.now() - t0 < 8000) {
  const a = ((Date.now() - t0) / 4000) * Math.PI * 2;
  await p.mouse.move(300 + 120 * Math.cos(a), 260 + 90 * Math.sin(a));
  await p.waitForTimeout(16);
}
await p.mouse.up();
const v = p.video(); await ctx.close(); console.log(await v.path()); await b.close();
