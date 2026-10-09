import { expect, test } from "@playwright/test";

/**
 * Lab Mode habit chips. Vitest runs with environment "node", so DOM and history
 * behaviour live here.
 */

const chip = (page: import("@playwright/test").Page, habit: string) =>
  page.locator(`#habit-chips .habit-chip[data-habit="${habit}"]`);

test("chips are hidden until Lab Mode is on", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await expect(page.locator("#seed-display")).toHaveText("abcde");
  await expect(page.locator("#habit-chips")).toBeHidden();
  await page.click("#lab-toggle");
  await expect(page.locator("#habit-chips")).toBeVisible();
  await expect(page.locator("#habit-chips .habit-chip")).toHaveCount(7);
});

test("a chip jumps to its habit, and one Back step returns to the previous crystal", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await page.click("#lab-toggle");
  // "ON" only after the Tweakpane chunk has loaded (it reads LOADING... first).
  await expect(page.locator("#lab-status")).toHaveText("ON");
  await expect(page.locator("#habit-chips")).toBeVisible();

  await chip(page, "needle").click();
  await expect(page.locator("#stat-habit")).toHaveText("Needle");
  await expect(chip(page, "needle")).toHaveAttribute("aria-pressed", "true");
  const needleUrl = page.url();
  // The share URL carries the exact preset: -6 °C at 70 %.
  const needleParams = new URL(needleUrl).searchParams;
  expect(needleParams.get("t")).toBe("-6.0");
  expect(needleParams.get("ss")).toBe("70");

  await chip(page, "fernlike_dendrite").click();
  await expect(page.locator("#stat-habit")).toHaveText("Fernlike dendrite");
  await expect(chip(page, "fernlike_dendrite")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "needle")).toHaveAttribute("aria-pressed", "false");

  await page.goBack();
  await expect(page.locator("#stat-habit")).toHaveText("Needle");
  await expect(chip(page, "needle")).toHaveAttribute("aria-pressed", "true");
  // The Lab slider re-snaps the restored temperature by a step fraction, so
  // compare the humidity, which lands exactly.
  expect(new URL(page.url()).searchParams.get("ss")).toBe(new URL(needleUrl).searchParams.get("ss"));
});

test("the active chip follows the Nakaya diagram keyboard, and only one is pressed", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await page.click("#lab-toggle");
  await expect(page.locator("#lab-status")).toHaveText("ON");
  await expect(page.locator("#habit-chips")).toBeVisible();

  // The diagram lives in the field guide. Opening Lab Mode moves focus to the
  // controls on the next frame; wait for that so it can't steal focus back.
  await expect(page.locator("#lab-controls")).toBeFocused();
  await page.click("#guide-toggle");
  await expect(page.locator("#field-guide")).toBeVisible();
  await page.locator("#nakaya-diagram").focus();
  await expect(page.locator("#nakaya-diagram")).toBeFocused();
  await page.keyboard.press("Home"); // -40 °C at 90 % → plate band
  await expect(page.locator("#stat-habit")).toHaveText("Hexagonal plate");
  await expect(chip(page, "plate")).toHaveAttribute("aria-pressed", "true");
  for (const habit of ["sector_plate", "stellar_dendrite", "fernlike_dendrite", "needle", "column", "capped_column"]) {
    await expect(chip(page, habit)).toHaveAttribute("aria-pressed", "false");
  }
});

test("chips wrap inside the 360px panel without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/?seed=abcde");
  await page.click("#lab-toggle");
  await expect(page.locator("#habit-chips")).toBeVisible();
  const box = await page.locator("#habit-chips").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
