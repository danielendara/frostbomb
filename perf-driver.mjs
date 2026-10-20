// Interleaved before/after perf rounds over scripts/perf-orbit.mjs (issue #438 method, --runs=1 each).
// before = unmodified origin/main (e3539bd) build, after = PR head build, both served by serve.mjs.
// Rounds alternate which build goes first. usage: node perf-driver.mjs <rounds> <out.json> <repo-with-perf-orbit>
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const REPO = process.argv[4];
const BUILDS = { before: "http://127.0.0.1:8787", after: "http://127.0.0.1:8788" };
let CONFIGS = [];
for (const seed of ["fox", "charlie"]) for (const [p, q] of [["desktop", "rich"], ["desktop", "lite"], ["low-end-mobile", "rich"], ["low-end-mobile", "lite"]]) CONFIGS.push([p, q, seed]);
// ONLY="profile:tier:seed,..." reruns a subset (supplementary batches); ORDER_FLIP=1 starts with the "after" build.
if (process.env.ONLY) CONFIGS = process.env.ONLY.split(",").map((c) => { const [p, q, seed] = c.split(":"); return [p, q, seed]; });
const FLIP = process.env.ORDER_FLIP === "1" ? 1 : 0;
const rounds = Number(process.argv[2] ?? 3);
const results = [];
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (let round = 0; round < rounds; round++) {
  for (const [profile, quality, seed] of CONFIGS) {
    const order = (round + FLIP) % 2 === 0 ? ["before", "after"] : ["after", "before"];
    for (const build of order) {
      const out = execFileSync("node", [`${REPO}/scripts/perf-orbit.mjs`, `--profile=${profile}`, `--quality=${quality}`, `--seed=${seed}`, "--runs=1", `--url=${BUILDS[build]}`], { encoding: "utf8", maxBuffer: 1 << 26 });
      const json = JSON.parse(out.slice(0, out.indexOf("\n| profile")));
      const r = json.runs[0];
      results.push({ round, profile, quality, seed, build, ...r, softwareRenderer: json.softwareRenderer });
      console.log(round, profile, quality, seed, build, r.fps, r.p50Ms, r.p95Ms, r.firstFrameMs);
    }
  }
  writeFileSync(process.argv[3], JSON.stringify(results, null, 1));
}
const rows = [];
for (const [profile, quality, seed] of CONFIGS) {
  const row = { profile, quality, seed };
  for (const build of ["before", "after"]) {
    const rs = results.filter((r) => r.profile === profile && r.quality === quality && r.seed === seed && r.build === build);
    row[build] = { fps: med(rs.map((r) => r.fps)), p50: med(rs.map((r) => r.p50Ms)), p95: med(rs.map((r) => r.p95Ms)), ff: med(rs.map((r) => r.firstFrameMs)), n: rs.length, p95Rounds: rs.map((r) => r.p95Ms) };
  }
  row.p95Ratio = +(row.after.p95 / row.before.p95).toFixed(3);
  rows.push(row);
}
console.log(JSON.stringify({ renderer: results[0].renderer, chrome: results[0].chrome, mode: results[0].mode, software: results[0].softwareRenderer, rounds, rows }, null, 1));
