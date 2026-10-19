// Interleaved before/after perf rounds over scripts/perf-orbit.mjs (same harness, --runs=1 each).
// usage: node perf-driver.mjs <rounds> <out.json>
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const REPO = "/workspace/frostbomb-441-2026-10-19/frostbomb";
const BUILDS = { before: "http://127.0.0.1:8787", after: "http://127.0.0.1:8788" };
const CONFIGS = [["desktop", "rich"], ["desktop", "lite"], ["low-end-mobile", "rich"], ["low-end-mobile", "lite"]];
const rounds = Number(process.argv[2] ?? 3);
const results = [];
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (let round = 0; round < rounds; round++) {
  for (const [profile, quality] of CONFIGS) {
    const order = round % 2 === 0 ? ["before", "after"] : ["after", "before"];
    for (const build of order) {
      const out = execFileSync("node", [`${REPO}/scripts/perf-orbit.mjs`, `--profile=${profile}`, `--quality=${quality}`, "--runs=1", `--url=${BUILDS[build]}`], { encoding: "utf8", maxBuffer: 1 << 26 });
      const json = JSON.parse(out.slice(0, out.indexOf("\n| profile")));
      const r = json.runs[0];
      results.push({ round, profile, quality, build, ...r, softwareRenderer: json.softwareRenderer });
      console.log(round, profile, quality, build, r.fps, r.p50Ms, r.p95Ms, r.firstFrameMs);
    }
  }
}
writeFileSync(process.argv[3], JSON.stringify(results, null, 1));
const rows = [];
for (const [profile, quality] of CONFIGS) {
  const row = { profile, quality };
  for (const build of ["before", "after"]) {
    const rs = results.filter((r) => r.profile === profile && r.quality === quality && r.build === build);
    row[build] = { fps: med(rs.map((r) => r.fps)), p50: med(rs.map((r) => r.p50Ms)), p95: med(rs.map((r) => r.p95Ms)), ff: med(rs.map((r) => r.firstFrameMs)), n: rs.length };
  }
  rows.push(row);
}
console.log(JSON.stringify({ renderer: results[0].renderer, chrome: results[0].chrome, mode: results[0].mode, software: results[0].softwareRenderer, rounds, rows }, null, 1));
