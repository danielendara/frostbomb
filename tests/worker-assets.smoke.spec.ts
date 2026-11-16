import { expect, test } from "@playwright/test";

// The Worker runs first for documents and `/api/*` (see `run_worker_first` in
// wrangler.jsonc); static assets and the SPA fallback must come through unchanged.
test.describe("worker entry keeps assets unchanged", () => {
  test("serves the app shell and SPA fallback, and handles /api/client-error", async ({ request }) => {
    const root = await request.get("/");
    expect(root.status()).toBe(200);
    expect(root.headers()["content-type"]).toContain("text/html");
    const shell = await root.text();
    expect(shell).toContain('id="scene"');

    const deep = await request.get("/some/deep/link");
    expect(deep.status()).toBe(200);
    expect(await deep.text()).toContain('id="scene"');

    const favicon = await request.get("/favicon.svg");
    expect(favicon.status()).toBe(200);
    expect(favicon.headers()["content-type"]).toContain("svg");

    const report = await request.post("/api/client-error", {
      data: { kind: "error", message: "smoke", build: "smoke", ua: "chrome" },
    });
    expect(report.status()).toBe(204);

    expect((await request.get("/api/client-error")).status()).toBe(405);
    expect((await request.post("/api/client-error", { data: { kind: "error" } })).status()).toBe(400);
  });
});
