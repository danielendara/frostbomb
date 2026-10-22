#!/usr/bin/env node
/**
 * Pixel diff RICH/LITE before (main) vs after (PR) at ?seed=abcde.
 * Usage: node scripts/visual-pixel-diff.mjs --before=http://127.0.0.1:8766 --after=http://127.0.0.1:8765
 *
 * pixelmatch/pngjs via npx (no lockfile deps).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, devices } from "@playwright/test";

const args = process.argv.slice(2);
const beforeBase = args.find((a) => a.startsWith("--before="))?.slice(9);
const afterBase = args.find((a) => a.startsWith("--after="))?.slice(8);
if (!beforeBase || !afterBase) {
  console.error("Need --before= and --after= base URLs");
  process.exit(1);
}

const outDir = mkdtempSync(join(tmpdir(), "frostbomb-pixel-"));

async function capture(base, name, reduced) {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    ...devices["Pixel 5"],
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/?seed=abcde`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForFunction(
    () => {
      const el = document.getElementById("seed-display");
      return el?.textContent && el.textContent !== "·····";
    },
    undefined,
    { timeout: 120_000 },
  );
  await page.waitForSelector('canvas[data-scene-nonblank="true"]', { timeout: 120_000 });
  const bootReady = await page.locator('[data-boot="ready"]').count();
  if (bootReady > 0) {
    await page.waitForSelector('[data-boot="ready"]', { timeout: 120_000 });
  }
  await page.waitForTimeout(3500);
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await browser.close();
  return path;
}

function diffPct(aPath, bPath) {
  const helperPath = join(process.cwd(), "scripts/pixel-diff-helper.mjs");
  const diffPath = join(outDir, `diff-${aPath.includes("rich") ? "rich" : "lite"}.png`);
  const r = spawnSync(
    "npx",
    [
      "--package=pixelmatch@5.0.0",
      "--package=pngjs@7.0.0",
      "node",
      helperPath,
      aPath,
      bPath,
      diffPath,
    ],
    { encoding: "utf8", cwd: process.cwd() },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  return JSON.parse(r.stdout.trim());
}

const richBefore = await capture(beforeBase, "before-rich", false);
const richAfter = await capture(afterBase, "after-rich", false);
const liteBefore = await capture(beforeBase, "before-lite", true);
const liteAfter = await capture(afterBase, "after-lite", true);

const rich = diffPct(richBefore, richAfter);
const lite = diffPct(liteBefore, liteAfter);

const report = {
  seed: "abcde",
  richDiffPct: rich.pct,
  liteDiffPct: lite.pct,
  artifactsDir: outDir,
};
writeFileSync(join(process.cwd(), ".perf-pixel-diff.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (rich.pct > 1 || lite.pct > 0.5) {
  process.exit(1);
}
