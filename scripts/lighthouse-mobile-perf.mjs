#!/usr/bin/env node
/**
 * Lighthouse mobile perf (3 runs, median). Matches Pedro's audit flags.
 * Usage: node scripts/lighthouse-mobile-perf.mjs [--url=http://127.0.0.1:4173/] [--runs=3]
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:4173/";
const runs = Number(args.find((a) => a.startsWith("--runs="))?.slice(7) ?? "3");

const chromeFlags = [
  "--headless=new",
  "--no-sandbox",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
].join(" ");

const outDir = join(process.cwd(), ".perf-lighthouse");
mkdirSync(outDir, { recursive: true });

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const results = [];

for (let i = 0; i < runs; i++) {
  const jsonPath = join(outDir, `run-${i}.json`);
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
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  const report = JSON.parse(readFileSync(jsonPath, "utf8"));
  const perf = report.categories.performance.score;
  const audits = report.audits;
  const tbt = audits["total-blocking-time"]?.numericValue ?? null;
  const lcp = audits["largest-contentful-paint"]?.numericValue ?? null;
  results.push({ score: perf * 100, tbt, lcp, jsonPath });
  console.log(`run ${i + 1}: score=${(perf * 100).toFixed(0)} LCP=${lcp?.toFixed(0)}ms TBT=${tbt?.toFixed(0)}ms`);
}

const summary = {
  url,
  runs: results.length,
  medianScore: median(results.map((r) => r.score)),
  medianLcp: median(results.map((r) => r.lcp ?? 0)),
  medianTbt: median(results.map((r) => r.tbt ?? 0)),
  raw: results,
};
writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log("\nMedian:", summary);
