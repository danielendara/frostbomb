import { test, expect } from '@playwright/test';

test('Lab mode has a Close Lab Mode button that works', async ({ page }) => {
  await page.goto('/');

  // Open Lab Mode
  await page.click('#lab-toggle');
  const labControls = page.locator('#lab-controls');
  await expect(labControls).toBeVisible();

  // Find and click the Close Lab Mode button
  const closeBtn = page.locator('#lab-close');
  await expect(closeBtn).toBeVisible();
  await expect(closeBtn).toHaveText('Close Lab Mode');

  await closeBtn.click();

  // Verify Lab Mode is closed
  await expect(labControls).not.toBeVisible();
});
