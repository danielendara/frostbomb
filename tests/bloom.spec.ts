import { test, expect } from '@playwright/test';

test('bloom toggle changes the visual output', async ({ page }) => {
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

  expect(screenshotWithBloom).not.toEqual(screenshotWithoutBloom);
});
