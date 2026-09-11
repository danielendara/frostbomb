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
});
