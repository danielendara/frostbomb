import { describe, expect, it } from "vitest";
// @ts-expect-error -- budget check is implemented as a Node .mjs script
import { budgetFailureHelpLines, collectBudgetFailures, evaluateThreeChunkBudget } from "../../scripts/check-three-chunk-budget.mjs";

describe("three.js chunk budget check", () => {
  const budget = {
    maxRawBytes: 595_000,
    maxGzipBytes: 147_000,
    headroomPolicy: "Raw limit ~2% above last measured build (same proportional headroom as gzip). Gzip is the primary transfer-cost gate.",
  };

  it("reports failures with headroom policy and remediation steps", () => {
    const measured = { files: ["three-test.js"], rawTotal: 600_000, gzipTotal: 140_000 };
    const result = evaluateThreeChunkBudget(budget, measured);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures).toContain("raw 600000 > 595000");
    expect(result.helpLines[0]).toMatch(/^intended headroom:/);
    expect(result.helpLines.join("\n")).toContain("re-measure");
    expect(result.helpLines.join("\n")).toContain("maxRawBytes and maxGzipBytes");
  });

  it("collectBudgetFailures flags raw and gzip separately", () => {
    expect(collectBudgetFailures(budget, 590_000, 150_000)).toEqual([
      "gzip 150000 > 147000",
    ]);
    expect(collectBudgetFailures(budget, 600_000, 140_000)).toEqual([
      "raw 600000 > 595000",
    ]);
  });

  it("budgetFailureHelpLines falls back when headroomPolicy is missing", () => {
    const lines = budgetFailureHelpLines({ maxRawBytes: 1, maxGzipBytes: 1 });
    expect(lines[0]).toContain("headroomPolicy");
  });
});