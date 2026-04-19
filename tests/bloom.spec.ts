import { test, expect } from '@playwright/test';

test('bloom toggle changes the visual output without breaking rendering', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.waitForSelector('canvas#scene');

  // Wait for initial animation to settle a bit
  await page.waitForTimeout(2500);

  const bloomButton = page.locator('#btn-bloom');
  await expect(bloomButton).toHaveAttribute('aria-pressed', 'true');

  const screenshotWithBloom = await page.screenshot();

  await bloomButton.click();
  await expect(bloomButton).toHaveAttribute('aria-pressed', 'false');

  // Wait for any transition
  await page.waitForTimeout(500);

  const screenshotWithoutBloom = await page.screenshot();

  // 1. Check that visuals actually changed
  expect(screenshotWithBloom).not.toEqual(screenshotWithoutBloom);

  // 2. Ensure that something is still rendered (not just a solid background color)
  // We check if the screenshot is NOT just the clear color (0x050912 -> approx rgb(5, 9, 18))
  // A simple way is to check if there's enough variance or specific colors in the center.

  // Alternative: Toggle regrow with bloom OFF and ensure it still animates
  const refreshButton = page.locator('#refresh');
  await refreshButton.click();

  await page.waitForTimeout(1000);
  const screenshotDuringRegrow = await page.screenshot();

  expect(screenshotDuringRegrow).not.toEqual(screenshotWithoutBloom);
});
