#!/usr/bin/env node
/**
 * Fail if the manual three.js chunk set exceeds the checked-in budget.
 * Run after `vite build` (wired into npm run verify).
 */
import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BUDGET_PATH = new URL("./three-chunk-budget.json", import.meta.url);

/**
 * @param {unknown} budget
 * @param {number} rawTotal
 * @param {number} gzipTotal
 * @returns {string[]}
 */
export function collectBudgetFailures(budget, rawTotal, gzipTotal) {
  const failures = [];
  if (rawTotal > budget.maxRawBytes) {
    failures.push(`raw ${rawTotal} > ${budget.maxRawBytes}`);
  }
  if (gzipTotal > budget.maxGzipBytes) {
    failures.push(`gzip ${gzipTotal} > ${budget.maxGzipBytes}`);
  }
  return failures;
}

/**
 * @returns {string[]}
 */
export function budgetFailureHelpLines() {
  return [
    "when over budget: re-measure with `npm run build` then `node scripts/check-three-chunk-budget.mjs`;",
    "if the growth is real, trim three.js usage or adjust vite chunking;",
    "otherwise raise maxRawBytes and maxGzipBytes together in the same PR using the new measured sizes.",
  ];
}

/**
 * @param {string} assetsDir
 * @param {string} prefix
 * @returns {{ files: string[], rawTotal: number, gzipTotal: number }}
 */
export function measureThreeChunks(assetsDir, prefix) {
  const files = readdirSync(assetsDir).filter((name) => name.startsWith(prefix) && name.endsWith(".js"));
  let rawTotal = 0;
  let gzipTotal = 0;
  for (const name of files.sort()) {
    const buf = readFileSync(join(assetsDir, name));
    rawTotal += buf.byteLength;
    gzipTotal += gzipSync(buf).byteLength;
  }
  return { files, rawTotal, gzipTotal };
}

/**
 * @param {unknown} budget
 * @param {{ files: string[], rawTotal: number, gzipTotal: number }} measured
 * @returns {{ ok: true } | { ok: false, failures: string[], helpLines: string[] }}
 */
export function evaluateThreeChunkBudget(budget, measured) {
  const failures = collectBudgetFailures(budget, measured.rawTotal, measured.gzipTotal);
  if (failures.length === 0) {
    return { ok: true };
  }
  return { ok: false, failures, helpLines: budgetFailureHelpLines() };
}

/**
 * @param {string} [budgetPath]
 * @returns {number}
 */
export function runCheck(budgetPath = DEFAULT_BUDGET_PATH) {
  const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
  const assetsDir = budget.assetsDir;
  const prefix = budget.chunkNamePrefix;

  const measured = measureThreeChunks(assetsDir, prefix);
  if (measured.files.length === 0) {
    console.error(`check-three-chunk-budget: no chunks matching ${prefix}*.js in ${assetsDir}`);
    return 1;
  }

  const result = evaluateThreeChunkBudget(budget, measured);
  if (!result.ok) {
    console.error("check-three-chunk-budget: budget exceeded (" + measured.files.join(", ") + ")");
    for (const line of result.failures) console.error("  " + line);
    for (const line of result.helpLines) console.error("  " + line);
    return 1;
  }

  console.log(
    `check-three-chunk-budget: ok (${measured.files.length} file(s), raw=${measured.rawTotal}, gzip=${measured.gzipTotal})`,
  );
  return 0;
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  process.exit(runCheck());
}