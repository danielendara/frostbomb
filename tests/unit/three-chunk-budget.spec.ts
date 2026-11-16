import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- budget check is implemented as a Node .mjs script
import {
  collectBudgetFailures,
  evaluateThreeChunkBudget,
} from "../../scripts/check-three-chunk-budget.mjs";

const ROOT = resolve(__dirname, "../..");
const budget = JSON.parse(
  readFileSync(resolve(ROOT, "scripts/three-chunk-budget.json"), "utf8"),
) as { maxRawBytes: number; maxGzipBytes: number };

describe("three.js chunk budget check", () => {
  it("uses checked-in caps from scripts/three-chunk-budget.json", () => {
    expect(budget.maxRawBytes).toBe(583_000);
    expect(budget.maxGzipBytes).toBe(147_000);
  });

  it("fails when measured sizes exceed the JSON caps", () => {
    const measured = {
      files: ["three-test.js"],
      rawTotal: budget.maxRawBytes + 1,
      gzipTotal: budget.maxGzipBytes,
    };
    const result = evaluateThreeChunkBudget(budget, measured);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures).toContain(
        `raw ${measured.rawTotal} > ${budget.maxRawBytes}`,
      );
      expect(result.helpLines.join("\n")).toContain("re-measure");
    }
  });

  it("passes when measured sizes are at or under the JSON caps", () => {
    const measured = {
      files: ["three-test.js"],
      rawTotal: budget.maxRawBytes,
      gzipTotal: budget.maxGzipBytes,
    };
    expect(evaluateThreeChunkBudget(budget, measured).ok).toBe(true);
  });

  it("collectBudgetFailures respects the JSON gzip cap", () => {
    expect(collectBudgetFailures(budget, 0, budget.maxGzipBytes + 1)).toEqual([
      `gzip ${budget.maxGzipBytes + 1} > ${budget.maxGzipBytes}`,
    ]);
  });
});