#!/usr/bin/env node
/**
 * Lighthouse mobile (SwiftShader): 3 runs, median score / LCP / TBT / longest index & scene tasks.
 * Usage: node scripts/lighthouse-swiftshader-median.mjs --url=http://127.0.0.1:8765/ [--runs=3] [--label=pr]
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:8765/";
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
  const jsonPath = join(outDir, `run-${i}.json`);
  const r = spawnSync(
    "npx",
    [
      "lighthouse@12.8.2",
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
    longTasks: report.audits["long-tasks"]?.details?.items ?? [],
  });
}

function longestForChunk(tasks, chunk) {
  const durations = tasks
    .filter((t) => (t.url ?? "").includes(chunk))
    .map((t) => t.duration);
  return durations.length ? Math.max(...durations) : 0;
}

const summary = {
  label,
  url,
  runs,
  medianScore: median(lhResults.map((r) => r.score)),
  medianLcp: median(lhResults.map((r) => r.lcp ?? 0)),
  medianTbt: median(lhResults.map((r) => r.tbt ?? 0)),
  medianLongestIndexTask: median(lhResults.map((r) => longestForChunk(r.longTasks, "index-"))),
  medianLongestSceneTask: median(lhResults.map((r) => longestForChunk(r.longTasks, "scene-"))),
};

writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
