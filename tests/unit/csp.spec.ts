import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { staticContentSecurityPolicy } from "../../src/worker/csp";
import worker from "../../src/worker/index";

const root = resolve(__dirname, "../..");
const builtIndex = resolve(root, "dist/client/index.html");

function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script\b([^>]*)>/gi)]
    .map((m) => m[1])
    .filter((attrs) => !/\bsrc\s*=/i.test(attrs));
}

function scriptSrcFromHeadersFile(): string {
  const headers = readFileSync(resolve(root, "public/_headers"), "utf8");
  const csp = headers.split("\n").find((l) => l.trim().startsWith("Content-Security-Policy:"));
  expect(csp).toBeDefined();
  const scriptSrc = csp!.split(";").find((d) => d.trim().startsWith("script-src"));
  expect(scriptSrc).toBeDefined();
  return scriptSrc!.trim();
}

describe("CSP", () => {
  beforeAll(() => {
    execSync("npx vite build", { cwd: root, stdio: "pipe" });
    expect(existsSync(builtIndex)).toBe(true);
  });

  it("static script-src has no 'unsafe-inline' and matches worker static policy", () => {
    const scriptSrc = scriptSrcFromHeadersFile();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(staticContentSecurityPolicy()).toContain(scriptSrc);
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

  it("Worker sets a nonce-bearing script-src on HTML asset responses", async () => {
    const assets = {
      fetch: async () =>
        new Response("<!doctype html><html><body id=\"scene\"></body></html>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    };
    const res = await worker.fetch(new Request("https://frostbomb.com/"), { ASSETS: assets });
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBeDefined();
    const scriptSrc = csp!.split(";").find((d) => d.trim().startsWith("script-src"))?.trim();
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).toMatch(/'nonce-[-A-Za-z0-9_]+'/);
  });
});