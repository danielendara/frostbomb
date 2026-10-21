import { test, expect } from "@playwright/test";

// "null": getContext returns null for webgl/webgl2. "stub": webgl2 returns a non-null object that
// makes renderer creation throw. 2d stays real for the Nakaya diagram.
for (const mode of ["null", "stub"] as const) {
  test.describe(`WebGL unavailable (${mode})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((m) => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
          if (m === "stub" && type === "webgl2") return {} as unknown as RenderingContext;
          if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
          return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
        } as typeof HTMLCanvasElement.prototype.getContext;
      }, mode);
    });

    test("static flake replaces the 3D view", async ({ page }) => {
      const reports: { kind: string; message: string }[] = [];
      await page.route("**/api/client-error", async (route) => {
        reports.push(route.request().postDataJSON());
        await route.fulfill({ status: 204 });
      });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto("/?seed=charlie");

      const img = page.locator("#webgl-fallback img");
      await expect(img).toBeVisible();
      await expect(img).toHaveAttribute("alt", /snowflake/i);
      await expect(page.locator("#webgl-fallback")).toContainText("3D view unavailable on this device");
      await expect(page.locator("#a11y-announcer")).toContainText("3D view unavailable");
      await expect(page.locator("#scene")).toBeHidden();

      // Field Guide, Nakaya diagram and keyboard still work.
      await expect(page.locator("#seed-display")).toContainText("charlie");
      await page.keyboard.press("r");
      await expect(page.locator("#seed-display")).not.toContainText("charlie");
      await page.keyboard.press("g");
      await expect(page.locator("#field-guide")).toBeVisible();
      await expect(page.locator("#nakaya-diagram")).toBeVisible();

      // 3D-only actions are disabled.
      for (const id of ["btn-rotate", "btn-reset", "btn-save", "btn-save-wallpaper", "btn-save-svg", "btn-save-3d"]) {
        await expect(page.locator(`#${id}`)).toBeDisabled();
      }

      // Reported exactly once per page load.
      await expect.poll(() => reports.filter((r) => r.kind === "webgl-unavailable").length).toBe(1);
      // The null path is caught by the WebGL2 availability check; the stub path only by the catch.
      const webglReports = reports.filter((r) => r.kind === "webgl-unavailable");
      if (mode === "null") expect(webglReports[0].message).toBe("WebGL2 unavailable");
      else expect(webglReports[0].message).not.toBe("WebGL2 unavailable");
      expect(errors).toEqual([]);
    });
  });
}
