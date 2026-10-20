// usage: node look.mjs <base> <seed> <quality> <out.png> [drag=0]
import { chromium } from "/workspace/fb442-proof/after2/node_modules/@playwright/test/index.mjs";
const [base, seed, quality, out, drag = "0"] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: Number(process.env.DSF ?? 1) });
const p = await ctx.newPage();
p.on("console", (m) => { if (m.type() === "error") console.log("console.error:", m.text().slice(0, 300)); });
await p.goto(`${base}/?seed=${seed}&rotate=0&quality=${quality}`);
await p.waitForSelector('canvas[data-entry-active="false"]', { timeout: 90000 });
// Settle: LITE 15 s (frost bake can land late under load); RICH 6 s (the quality monitor demotes RICH to LITE after ~10 s on the ~1 fps software renderer).
await p.waitForTimeout(Number(process.env.SETTLE_MS ?? (quality === "rich" ? 6000 : 15000)));
if (drag !== "0") { await p.mouse.move(500, 350); await p.mouse.down(); await p.mouse.move(520, 360, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(3000); }
const tier = await p.getAttribute("canvas", "data-quality");
console.log("glint:", await p.getAttribute("canvas", "data-glint"), "tier:", tier);
if (tier !== quality) { console.error(`TIER_MISMATCH asked ${quality} got ${tier}`); process.exit(3); }
await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
await p.screenshot({ path: out, clip: process.env.CLIP ? Object.fromEntries(["x","y","width","height"].map((k,i)=>[k,Number(process.env.CLIP.split(",")[i])])) : undefined });
await b.close();
