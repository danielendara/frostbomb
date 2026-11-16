import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_ERROR_KINDS } from "../../src/client-error-contract";

describe("docs/RELEASE.md", () => {
  const release = readFileSync(resolve(__dirname, "../../docs/RELEASE.md"), "utf8");
  const headers = readFileSync(resolve(__dirname, "../../public/_headers"), "utf8");
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, "../../package.json"), "utf8"),
  ) as { scripts: Record<string, string> };

  it("matches the current Worker deploy flow", () => {
    expect(pkg.scripts.deploy).toBe("npm run build && wrangler deploy");
    expect(release).toContain("wrangler deploy");
    expect(release).toContain("npm run build && wrangler deploy");
    expect(release).toContain("test:unit");
    expect(release).toMatch(/e2e|Playwright/i);
    expect(release).toMatch(/npm run deploy/);
    expect(release).toMatch(/rollback/i);
  });

  it("requires a live CSP / _headers and postprocessing-not-modulepreloaded check", () => {
    expect(headers).toMatch(/Content-Security-Policy/);
    expect(release).toMatch(/Content-Security-Policy/);
    expect(release).toMatch(/_headers/);
    expect(release).toMatch(/modulepreload/);
    expect(release).toMatch(/postprocessing/);
  });

  // The runbook is what an operator reads during a release or an incident, so the two
  // facts it restates from code are checked against the code, not kept in sync by hand.
  it("lists every client-error kind the Worker accepts", () => {
    const row = release.split("\n").find((line) => line.startsWith("| `kind` |"));
    expect(row, "the `kind` row of the client-error field table").toBeDefined();
    const documented = [...(row ?? "").matchAll(/`([a-z-]+)`/g)].map((match) => match[1]).filter((name) => name !== "kind");
    expect(documented.sort()).toEqual([...CLIENT_ERROR_KINDS].sort());
  });

  it("names every run_worker_first pattern from wrangler.jsonc", () => {
    // wrangler.jsonc allows comments; this file only has whole-line ones.
    const jsonc = readFileSync(resolve(__dirname, "../../wrangler.jsonc"), "utf8");
    const wrangler = JSON.parse(jsonc.replace(/^\s*\/\/.*$/gm, "")) as {
      assets: { run_worker_first: string[] };
    };
    const patterns = wrangler.assets.run_worker_first;
    expect(patterns.length).toBeGreaterThan(0);
    for (const pattern of patterns) {
      expect(release, `docs/RELEASE.md should mention \`${pattern}\``).toContain(`\`${pattern}\``);
    }
    expect(release).not.toMatch(/only runs for `\/api\/\*`|limited to `\/api\/\*`/);
  });
});
