import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
    expect(release).toMatch(/pnpm deploy/);
    expect(release).toMatch(/rollback/i);
  });

  it("requires a live CSP / _headers and postprocessing-not-modulepreloaded check", () => {
    expect(headers).toMatch(/Content-Security-Policy/);
    expect(release).toMatch(/Content-Security-Policy/);
    expect(release).toMatch(/_headers/);
    expect(release).toMatch(/modulepreload/);
    expect(release).toMatch(/postprocessing/);
  });
});
