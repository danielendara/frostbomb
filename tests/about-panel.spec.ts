import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
});

test("About panel opens from the button and closes with Escape", async ({ page }) => {
  const panel = page.locator("#about-panel");
  const aboutBtn = page.locator("#btn-about");

  await expect(panel).toBeHidden();
  await aboutBtn.click();
  await expect(panel).toBeVisible();
  await expect(aboutBtn).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(aboutBtn).toBeFocused();
  await expect(aboutBtn).toHaveAttribute("aria-expanded", "false");
});

test("About panel stays closed in Photo Mode", async ({ page }) => {
  await page.locator("#btn-about").click();
  await expect(page.locator("#about-panel")).toBeVisible();

  await page.keyboard.press("h");
  await expect(page.locator(".masthead")).toHaveClass(/ui-hidden/);
  await expect(page.locator("#about-panel")).toBeHidden();
});
