import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 360, height: 640 } });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => {
    document.getAnimations().forEach((animation) => {
      try {
        animation.finish();
      } catch {
        animation.cancel();
      }
    });
  });
});

test("About button opens panel and Escape closes it with focus on button", async ({
  page,
}) => {
  const aboutBtn = page.locator("#btn-about");
  const panel = page.locator("#about-panel");

  await expect(panel).toBeHidden();
  await aboutBtn.click();
  await expect(panel).toBeVisible();
  await expect(aboutBtn).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(aboutBtn).toHaveAttribute("aria-expanded", "false");
  await expect(aboutBtn).toBeFocused();
});

test("About panel shows colophon copy and flake image without horizontal scroll at 360px", async ({
  page,
}) => {
  await page.locator("#btn-about").click();
  const panel = page.locator("#about-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Nakaya diagram");
  await expect(panel.locator('img[src="/fallback-flake.webp"]')).toBeVisible();

  const hasHorizontalScroll = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalScroll).toBe(false);
});

test("About panel hides with Photo Mode chrome", async ({ page }) => {
  await page.locator("#btn-about").click();
  await expect(page.locator("#about-panel")).toBeVisible();

  await page.keyboard.press("h");
  await expect(page.locator("#about-panel")).toBeHidden();
  await expect(page.locator(".masthead")).toBeHidden();
});
