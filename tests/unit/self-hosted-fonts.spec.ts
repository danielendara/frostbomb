import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("self-hosted display fonts", () => {
  it("does not reference Google Fonts in the document or CSP", () => {
    const html = readFileSync("index.html", "utf8");
    const headers = readFileSync("public/_headers", "utf8");
    const css = readFileSync("src/style.css", "utf8");

    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(headers).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(headers).toMatch(/font-src 'self'/);
    expect(css).toContain('url("/fonts/cormorant-garamond-latin-300-italic.woff2")');
    expect(css).toContain('url("/fonts/jetbrains-mono-latin-400-normal.woff2")');
    expect(existsSync("public/fonts/OFL-Cormorant-Garamond.txt")).toBe(true);
    expect(existsSync("public/fonts/OFL-JetBrains-Mono.txt")).toBe(true);
  });

  it("preloads only the wordmark face, with crossorigin", () => {
    const html = readFileSync("index.html", "utf8");
    const preloads = html.match(/<link\b[^>]*\brel="preload"[^>]*>/g) ?? [];

    expect(preloads).toHaveLength(1);
    expect(preloads[0]).toContain('href="/fonts/cormorant-garamond-latin-300-italic.woff2"');
    expect(preloads[0]).toContain('as="font"');
    expect(preloads[0]).toContain('type="font/woff2"');
    expect(preloads[0]).toMatch(/\bcrossorigin\b/);
  });
});
