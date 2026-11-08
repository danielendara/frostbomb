import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index";

const root = resolve(__dirname, "../..");
const EXPECTED = "max-age=86400";

describe("HSTS", () => {
  it("public/_headers sets Strict-Transport-Security under /* without includeSubDomains/preload", () => {
    const lines = readFileSync(resolve(root, "public/_headers"), "utf8").split("\n");
    const star = lines.findIndex((l) => l.trim() === "/*");
    expect(star).toBeGreaterThanOrEqual(0);
    const block: string[] = [];
    for (const l of lines.slice(star + 1)) {
      if (l.trim() !== "" && !/^\s/.test(l)) break;
      block.push(l.trim());
    }
    const hsts = block.find((l) => l.toLowerCase().startsWith("strict-transport-security:"));
    expect(hsts).toBeDefined();
    const value = hsts!.slice(hsts!.indexOf(":") + 1).trim();
    expect(value).toBe(EXPECTED);
    expect(value).not.toMatch(/includeSubDomains|preload/i);
  });

  it.each([
    ["POST /api/client-error (400, empty body)", "https://frostbomb.com/api/client-error", "POST"],
    ["GET /api/client-error (405)", "https://frostbomb.com/api/client-error", "GET"],
    ["unknown Worker path (404)", "https://frostbomb.com/api/nope", "GET"],
  ])("Worker response sets HSTS: %s", async (_n, url, method) => {
    const res = await worker.fetch(new Request(url, { method }));
    const v = res.headers.get("strict-transport-security");
    expect(v).toBe(EXPECTED);
    expect(v).not.toMatch(/includeSubDomains|preload/i);
  });
});
