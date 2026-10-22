import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = "src";

/** Namespace imports from three block bundler tree-shaking in src/snowflake. */
const NAMESPACE_THREE_RE =
  /import\s+\*\s+as\s+\w+\s+from\s+["']three["']\s*;?/;

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(path));
    else if (entry.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

describe("three.js imports in src/", () => {
  it("does not use namespace imports from three (tree-shaking)", () => {
    const offenders: string[] = [];
    for (const file of collectTsFiles(SRC_ROOT)) {
      const text = readFileSync(file, "utf8");
      if (NAMESPACE_THREE_RE.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
