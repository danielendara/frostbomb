import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const PROJECT_GUARD =
  "playwright.config.ts must declare every project unconditionally. Narrow with --project in package.json scripts, not with an env default.";
const RULE_GUARD =
  "scripts/e2e-mode.sh is the only place for the e2e change-scope rule; ci.yml and scripts/verify.sh must call it and must not assign e2e_mode= inline.";

function parseE2eMode(output: string): string {
  const line = output
    .split("\n")
    .find((l) => l.startsWith("e2e_mode="));
  expect(line, output).toBeDefined();
  return line!.slice("e2e_mode=".length);
}

function e2eModeForFixtureFiles(...files: string[]): string {
  const quoted = files.map((f) => `'${f.replace(/'/g, "'\\''")}'`).join(" ");
  const out = execSync(`bash scripts/e2e-mode.sh --fixtures ${quoted}`, {
    cwd: ROOT,
    encoding: "utf8",
  });
  return parseE2eMode(out);
}

describe("playwright e2e config guardrail", () => {
  it("declares chromium and sequential-smoke without env-based project gating", async () => {
    const mod = await import("../../playwright.config.ts");

    const projects = mod.default.projects ?? [];
    const names = projects.map((p) => (typeof p === "object" && p && "name" in p ? p.name : ""));
    if (!names.includes("chromium") || !names.includes("sequential-smoke")) {
      throw new Error(PROJECT_GUARD);
    }
    expect(names).toContain("chromium");
    expect(names).toContain("sequential-smoke");
  });

  it("evaluates scripts/e2e-mode.sh fixtures for docs vs app entry", () => {
    expect(e2eModeForFixtureFiles("README.md")).toBe("smoke");
    expect(e2eModeForFixtureFiles("src/main.ts")).toBe("full");
    expect(e2eModeForFixtureFiles("src/snowflake/scene.ts")).toBe("full");
    expect(e2eModeForFixtureFiles("tests/example.spec.ts")).toBe("full");
  });

  it("keeps the e2e scope rule only in scripts/e2e-mode.sh", () => {
    const ci = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
    const verify = readFileSync(resolve(ROOT, "scripts/verify.sh"), "utf8");

    expect(ci, RULE_GUARD).toContain("scripts/e2e-mode.sh");
    expect(verify, RULE_GUARD).toContain("scripts/e2e-mode.sh");
    expect(ci, RULE_GUARD).not.toMatch(/^\s*e2e_mode=(?:full|smoke)\b/m);
    expect(verify, RULE_GUARD).not.toMatch(/^\s*e2e_mode=(?:full|smoke)\b/m);
  });
});
