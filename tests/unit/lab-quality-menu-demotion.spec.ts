import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Lab Quality menu stays aligned after auto demotion (#483)", () => {
  it("notifies main so LabPanel.syncQuality runs when the governor demotes", () => {
    const scene = readFileSync("src/snowflake/scene.ts", "utf8");
    const main = readFileSync("src/main.ts", "utf8");
    expect(scene).toContain("onAutoQualityDemotion?: (tier: QualityTier) => void");
    expect(scene).toMatch(/options\.onAutoQualityDemotion\?\.\(demoted\)/);
    expect(main).toContain("onAutoQualityDemotion: (tier) => labQualityAfterAutoDemotion.sync?.(tier)");
    expect(main).toContain("labQualityAfterAutoDemotion.sync = (tier) => labPanel.syncQuality(tier)");
  });

  it("mutation guard: demotion must call onAutoQualityDemotion after applyTier", () => {
    const scene = readFileSync("src/snowflake/scene.ts", "utf8");
    const start = scene.indexOf("function adaptQuality(delta: number)");
    const end = scene.indexOf("function animate(timestamp?: number)", start);
    const adaptBlock = scene.slice(start, end);
    expect(adaptBlock).toContain("applyTier()");
    expect(adaptBlock).toContain("options.onAutoQualityDemotion?.(demoted)");
    expect(adaptBlock.indexOf("applyTier()")).toBeLessThan(
      adaptBlock.indexOf("options.onAutoQualityDemotion?.(demoted)"),
    );
  });
});
