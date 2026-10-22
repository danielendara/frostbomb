#!/usr/bin/env node
/**
 * Fail if the manual three.js chunk set exceeds the checked-in budget.
 * Run after `vite build` (wired into npm run verify).
 */
import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const budget = JSON.parse(readFileSync(new URL("./three-chunk-budget.json", import.meta.url), "utf8"));

const assetsDir = budget.assetsDir;
const prefix = budget.chunkNamePrefix;

const files = readdirSync(assetsDir).filter((name) => name.startsWith(prefix) && name.endsWith(".js"));
if (files.length === 0) {
  console.error(`check-three-chunk-budget: no chunks matching ${prefix}*.js in ${assetsDir}`);
  process.exit(1);
}

let rawTotal = 0;
let gzipTotal = 0;
for (const name of files.sort()) {
  const buf = readFileSync(join(assetsDir, name));
  rawTotal += buf.byteLength;
  gzipTotal += gzipSync(buf).byteLength;
}

const failures = [];
if (rawTotal > budget.maxRawBytes) {
  failures.push(`raw ${rawTotal} > ${budget.maxRawBytes}`);
}
if (gzipTotal > budget.maxGzipBytes) {
  failures.push(`gzip ${gzipTotal} > ${budget.maxGzipBytes}`);
}

if (failures.length > 0) {
  console.error("check-three-chunk-budget: budget exceeded (" + files.join(", ") + ")");
  for (const line of failures) console.error("  " + line);
  process.exit(1);
}

console.log(
  `check-three-chunk-budget: ok (${files.length} file(s), raw=${rawTotal}, gzip=${gzipTotal})`,
);
