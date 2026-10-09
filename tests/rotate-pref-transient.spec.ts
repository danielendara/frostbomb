import { test, expect } from "@playwright/test";
import { withHeldMeshExport } from "./e2e-helpers";
import { MODE_PREFS_KEY } from "../src/mode-prefs";

test("Pink during a held 3D export keeps the stored rotate pref on", async ({ page }) => {
  test.setTimeout(120_000);

  await withHeldMeshExport(page, async ({ releaseExport, requested }) => {
    await page.goto("/?seed=abcde");
    await expect(page.locator("#seed-display")).toHaveText("abcde");
    await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "true");

    const download = page.waitForEvent("download");
    await page.keyboard.press("t");
    await requested;
    await page.keyboard.press("p");
    await expect(page.locator("#btn-pink")).toHaveAttribute("aria-pressed", "true");
    releaseExport();
    await download;

    const stored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || "{}"),
      MODE_PREFS_KEY,
    );
    expect(stored.pink).toBe(true);
    expect(stored.rotate).toBe(true);
  });

  await page.reload();
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "true");
});

test("Pink under reduced motion leaves rotate absent from stored prefs", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?seed=abcde");
  await expect(page.locator("#seed-display")).toHaveText("abcde");

  await page.keyboard.press("p");
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "{}"),
    MODE_PREFS_KEY,
  );
  expect(stored.pink).toBe(true);
  expect(stored.rotate).toBeUndefined();
});
