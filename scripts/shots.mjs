#!/usr/bin/env node
// Fixed-seed screenshot set (one seed per habit) for rendering before/after comparisons.
//
//   npm run preview
//   node scripts/shots.mjs --label=baseline [--url=http://127.0.0.1:8787] [--quality=rich|lite]
//
// Writes docs/pr-shots/rendering/<label>/<habit>.png plus grid.png (all five labeled).
// --quality is passed as ?quality= (tier override); without it the app picks the tier itself.
// Comparison is by eye: background particles are random per load, so "near-identical"
// means the flake matches. There is no pixel-diff threshold.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// One seed per habit, chosen from the 7 habits in src/snowflake/nakaya.ts.
// `needle` and plain `column` are not required.
const SEEDS = [
  { habit: "plate", seed: "fox" },
  { habit: "sector_plate", seed: "nov" },
  { habit: "stellar_dendrite", seed: "charlie" },
  { habit: "fernlike_dendrite", seed: "alpha" },
  { habit: "capped_column", seed: "whisky" },
];

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = "true"] = a.replace(/^--/, "").split("=");
    return [k, v];
  }),
);
const label = args.label;
if (!label || !/^[\w.-]+$/.test(label)) {
  console.error("usage: node scripts/shots.mjs --label=<name> [--url=...] [--quality=rich|lite]");
  process.exit(2);
}
const base = args.url ?? "http://127.0.0.1:8787";
const dir = `docs/pr-shots/rendering/${label}`;
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const files = [];
for (const { habit, seed } of SEEDS) {
  const params = new URLSearchParams({ seed, rotate: "0" });
  if (args.quality) params.set("quality", args.quality);
  await page.goto(`${base}/?${params}`);
  await page.waitForSelector('canvas[data-entry-active="false"]', { timeout: 60_000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const file = `${dir}/${habit}.png`;
  await page.screenshot({ path: file });
  files.push({ habit, seed, file });
  console.log(`${habit} seed=${seed} -> ${file}`);
}

const tiles = files.map((f) => ({ ...f, b64: readFileSync(f.file).toString("base64") }));
const gridPage = await ctx.newPage();
await gridPage.setContent(
  `<body style="margin:0;background:#111;color:#eee;font:14px monospace"><div style="display:grid;grid-template-columns:repeat(3,500px);gap:4px">${tiles
    .map((t) => `<figure style="margin:0"><img width="500" src="data:image/png;base64,${t.b64}"><figcaption>${label}: ${t.habit} (seed ${t.seed})</figcaption></figure>`)
    .join("")}</div></body>`,
);
await gridPage.screenshot({ path: `${dir}/grid.png`, fullPage: true });
console.log(`grid -> ${dir}/grid.png`);
await browser.close();
