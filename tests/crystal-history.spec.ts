import { test, expect } from "@playwright/test";

/**
 * #316 — Back goes back a crystal.
 *
 * Deliberate crystal changes push a history entry; a slider drag does not.
 */

// The display is styled uppercase; the seed itself is lowercase.
async function currentSeed(page: import("@playwright/test").Page) {
  return (await page.locator("#seed-display").innerText()).toLowerCase();
}

async function expectSeed(page: import("@playwright/test").Page, seed: string) {
  await expect(page.locator("#seed-display")).toHaveText(seed.toUpperCase(), { ignoreCase: true });
}

test("grow three crystals, then Back twice returns to the first", async ({ page }) => {
  await page.goto("/?seed=abcde");
  const first = await currentSeed(page);
  expect(first).toBe("abcde");

  await page.locator("#refresh").click();
  const second = await currentSeed(page);
  await page.locator("#refresh").click();
  const third = await currentSeed(page);
  expect(new Set([first, second, third]).size).toBe(3);

  await page.goBack();
  await expectSeed(page, second);

  await page.goBack();
  await expectSeed(page, first);

  // The canvas still shows a crystal — a restore must never blank it.
  const drawn = await page.evaluate(() => {
    const canvas = document.getElementById("scene") as HTMLCanvasElement | null;
    return Boolean(canvas && canvas.width > 0 && canvas.height > 0);
  });
  expect(drawn).toBe(true);

  // Forward works too: the same state the equivalent share link would produce.
  await page.goForward();
  await expectSeed(page, second);
});

test("a look toggle coalesces into the current entry instead of pushing one", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await expectSeed(page, "abcde");

  const before = await page.evaluate(() => window.history.length);
  await page.locator("#btn-pink").click();
  await page.locator("#btn-prism").click();
  const afterToggles = await page.evaluate(() => window.history.length);
  expect(afterToggles).toBe(before);

  // ...while growing a crystal does push one.
  await page.locator("#refresh").click();
  const afterGrow = await page.evaluate(() => window.history.length);
  expect(afterGrow).toBe(before + 1);

  await page.goBack();
  await expectSeed(page, "abcde");
});
