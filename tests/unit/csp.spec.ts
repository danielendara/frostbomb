import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script\b([^>]*)>/gi)]
    .map((m) => m[1])
    .filter((attrs) => !/\bsrc\s*=/i.test(attrs));
}

describe("CSP", () => {
  it("script-src does not allow 'unsafe-inline'", () => {
    const headers = readFileSync(resolve(root, "public/_headers"), "utf8");
    const csp = headers.split("\n").find((l) => l.trim().startsWith("Content-Security-Policy:"));
    expect(csp).toBeDefined();
    const scriptSrc = csp!.split(";").find((d) => d.trim().startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("index.html has no inline scripts or on* handlers", () => {
    const html = readFileSync(resolve(root, "index.html"), "utf8");
    expect(inlineScripts(html)).toEqual([]);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it.skipIf(!existsSync(resolve(root, "dist/client/index.html")))(
    "built index.html has no inline scripts",
    () => {
      const html = readFileSync(resolve(root, "dist/client/index.html"), "utf8");
      expect(inlineScripts(html)).toEqual([]);
    },
  );
});
