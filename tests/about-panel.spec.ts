import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/");
});

test("About panel opens from the masthead button and closes with Escape", async ({ page }) => {
  const aboutBtn = page.locator("#btn-about");
  const aboutPanel = page.locator("#about-panel");

  await expect(aboutPanel).not.toBeVisible();
  await aboutBtn.click();
  await expect(aboutPanel).toBeVisible();
  await expect(aboutPanel).toContainText("About frost");
  await expect(aboutPanel).toContainText("No two are alike");
  await expect(aboutBtn).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Escape");
  await expect(aboutPanel).not.toBeVisible();
  await expect(aboutBtn).toHaveAttribute("aria-expanded", "false");
  await expect(aboutBtn).toBeFocused();
});
