import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reduced-motion chrome entrances", () => {
  const css = readFileSync("src/style.css", "utf8");
  const reduceBlocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map(
    (match) => match[1],
  );

  it("shows field notes, footer, and masthead immediately when motion is reduced", () => {
    const riseBlock = reduceBlocks.find(
      (block) => block.includes(".field-notes") && block.includes(".footer") && block.includes(".masthead"),
    );
    expect(riseBlock).toBeTruthy();
    expect(riseBlock).toMatch(/animation:\s*none/);
    expect(riseBlock).toMatch(/opacity:\s*1/);
    expect(riseBlock).toMatch(/transform:\s*none/);
  });

  it("still runs the rise entrance without the preference", () => {
    expect(css).toMatch(/\.field-notes \{[^}]*animation:\s*rise[^;}]*both/);
    expect(css).toMatch(/\.footer \{[^}]*animation:\s*rise[^;}]*both/);
    expect(css).toMatch(/\.masthead \{[^}]*animation:\s*rise[^;}]*both/);
  });

  it("keeps the existing button spin and press suppression", () => {
    const spinBlock = reduceBlocks.find(
      (block) => block.includes(".btn-press") && block.includes(".animate-spin-once"),
    );
    expect(spinBlock).toBeTruthy();
    expect(spinBlock).toContain("#btn-rotate.active .action-btn__icon");
    expect(spinBlock).toContain("#btn-pink.active .action-btn__icon");
    expect(spinBlock).toContain("#btn-prism.active .action-btn__icon");
    expect(spinBlock).toMatch(/animation:\s*none\s*!important/);
    expect(spinBlock).not.toContain(".field-notes");
    expect(spinBlock).not.toContain(".masthead");
  });
});
