import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { CSP_DIRECTIVES, parseContentSecurityPolicy } from "../../src/worker/csp";

const root = resolve(__dirname, "../..");
const builtIndex = resolve(root, "dist/client/index.html");

function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script\b([^>]*)>/gi)]
    .map((m) => m[1])
    .filter((attrs) => !/\bsrc\s*=/i.test(attrs));
}

function cspLineFromHeadersFile(): string {
  const headers = readFileSync(resolve(root, "public/_headers"), "utf8");
  const csp = headers.split("\n").find((l) => l.trim().startsWith("Content-Security-Policy:"));
  expect(csp).toBeDefined();
  return csp!.slice(csp!.indexOf(":") + 1).trim();
}

describe("CSP", () => {
  beforeAll(() => {
    execSync("npx vite build", { cwd: root, stdio: "pipe" });
    expect(existsSync(builtIndex)).toBe(true);
  });

  it("public/_headers /* CSP directives match CSP_DIRECTIVES", () => {
    const parsed = parseContentSecurityPolicy(cspLineFromHeadersFile());
    const expected: Record<string, string[]> = {};
    for (const [key, values] of Object.entries(CSP_DIRECTIVES)) {
      expected[key] = [...values];
    }
    expect(parsed).toEqual(expected);
    expect(parsed["script-src"]).not.toContain("'unsafe-inline'");
  });

  it("index.html has no inline scripts or on* handlers", () => {
    const html = readFileSync(resolve(root, "index.html"), "utf8");
    expect(inlineScripts(html)).toEqual([]);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it("built index.html has no inline scripts", () => {
    const html = readFileSync(builtIndex, "utf8");
    expect(inlineScripts(html)).toEqual([]);
  });
});