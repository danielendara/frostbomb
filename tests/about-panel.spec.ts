import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("About panel opens from the header button and closes with Escape", async ({ page }) => {
  const btnAbout = page.locator("#btn-about");
  const panel = page.locator("#about-panel");

  await expect(panel).toBeHidden();

  await btnAbout.click();
  await expect(panel).toBeVisible();
  await expect(btnAbout).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(btnAbout).toHaveAttribute("aria-expanded", "false");
  await expect(btnAbout).toBeFocused();
});
