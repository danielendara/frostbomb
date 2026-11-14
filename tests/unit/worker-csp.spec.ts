import { describe, expect, it } from "vitest";
import { CSP_DIRECTIVES, parseContentSecurityPolicy } from "../../src/worker/csp";
import worker from "../../src/worker/index";

const htmlAsset = {
  fetch: async () =>
    new Response("<!doctype html><html><body id=\"scene\"></body></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
};

function nonceFromCsp(csp: string): string {
  const scriptSrc = parseContentSecurityPolicy(csp)["script-src"];
  expect(scriptSrc).toBeDefined();
  const token = scriptSrc!.find((v) => v.startsWith("'nonce-"));
  expect(token).toBeDefined();
  return token!.slice("'nonce-".length, -1);
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function expectedHtmlDirectives(nonceToken: string): Record<string, string[]> {
  const expected: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(CSP_DIRECTIVES)) {
    expected[key] = key === "script-src" ? [`'nonce-${nonceToken}'`, ...values] : [...values];
  }
  return expected;
}

describe("Worker CSP", () => {
  it("HTML responses get distinct nonces with at least 128 bits of entropy", async () => {
    const env = { ASSETS: htmlAsset };
    const a = await worker.fetch(new Request("https://frostbomb.com/"), env);
    const b = await worker.fetch(new Request("https://frostbomb.com/deep"), env);
    const cspA = a.headers.get("Content-Security-Policy");
    const cspB = b.headers.get("Content-Security-Policy");
    expect(cspA).toBeDefined();
    expect(cspB).toBeDefined();
    const nonceA = nonceFromCsp(cspA!);
    const nonceB = nonceFromCsp(cspB!);
    expect(nonceA).not.toBe(nonceB);
    expect(decodeBase64Url(nonceA).length).toBeGreaterThanOrEqual(16);
    expect(decodeBase64Url(nonceB).length).toBeGreaterThanOrEqual(16);
  });

  it("HTML Content-Security-Policy equals CSP_DIRECTIVES plus one script-src nonce", async () => {
    const res = await worker.fetch(new Request("https://frostbomb.com/"), { ASSETS: htmlAsset });
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBeDefined();
    const parsed = parseContentSecurityPolicy(csp!);
    const nonce = nonceFromCsp(csp!);
    expect(parsed).toEqual(expectedHtmlDirectives(nonce));
    expect(parsed["script-src"]).not.toContain("'unsafe-inline'");
    expect(parsed["script-src"]!.filter((v) => v.startsWith("'nonce-"))).toHaveLength(1);
  });

  it("non-HTML asset responses pass through without CSP changes", async () => {
    const body = "export const x = 1;\n";
    const assets = {
      fetch: async () =>
        new Response(body, {
          status: 200,
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "public, max-age=31536000, immutable",
            "x-content-type-options": "nosniff",
          },
        }),
    };
    const raw = await assets.fetch();
    const viaWorker = await worker.fetch(new Request("https://frostbomb.com/assets/index.js"), { ASSETS: assets });
    expect(viaWorker.status).toBe(raw.status);
    expect(await viaWorker.text()).toBe(body);
    const workerCsp = viaWorker.headers.get("Content-Security-Policy");
    const rawCsp = raw.headers.get("Content-Security-Policy");
    expect(workerCsp).toBe(rawCsp);
    expect(viaWorker.headers.get("cache-control")).toBe(raw.headers.get("cache-control"));
    expect(viaWorker.headers.get("content-type")).toBe(raw.headers.get("content-type"));
    expect(viaWorker.headers.get("x-content-type-options")).toBe(raw.headers.get("x-content-type-options"));
  });
});