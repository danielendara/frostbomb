import { test, expect } from "@playwright/test";

const MODE_PREFS_KEY = "frostbomb-mode-prefs";

test("Pink during a held 3D export keeps the stored rotate pref on (#389)", async ({ page }) => {
  test.setTimeout(120_000);

  let releaseExport!: () => void;
  const exportGate = new Promise<void>((resolve) => {
    releaseExport = resolve;
  });
  let markRequested!: () => void;
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve;
  });
  await page.route(/mesh-export\.ts/, async (route) => {
    markRequested();
    await exportGate;
    await route.continue();
  });

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

  await page.unroute(/mesh-export\.ts/);
  await page.reload();
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "true");
});

test("Pink under reduced motion leaves rotate absent from stored prefs (#389)", async ({
  page,
}) => {
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
