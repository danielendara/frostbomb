import { test, expect } from '@playwright/test';

test.describe('Recent Seeds persistence and interaction', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start fresh
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
    await page.goto('/');
  });

  test('generates, persists, and lists recent seeds', async ({ page }) => {
    // Open the field guide to see the Recent Seeds section
    const guideToggle = page.locator('#guide-toggle');
    await guideToggle.click();
    await expect(page.locator('#field-guide')).toBeVisible();

    // Verify recent seeds container exists
    const recentContainer = page.locator('#recent-seeds-container');
    await expect(recentContainer).toBeVisible();

    // On initial load, a seed is generated, so it should be listed in recent seeds
    const seedDisplay = page.locator('#seed-display');
    const initialSeed = await seedDisplay.textContent();
    expect(initialSeed).toBeTruthy();

    const recentButtons = recentContainer.locator('.recent-seed-btn');
    await expect(recentButtons).toHaveCount(1);
    await expect(recentButtons.first()).toContainText(initialSeed!);

    // Grow a new snowflake using 'r' key
    await page.keyboard.press('r');

    // Wait for a second seed to appear in the list
    await expect(async () => {
      const count = await recentButtons.count();
      expect(count).toBe(2);
    }).toPass();

    const secondSeed = await seedDisplay.textContent();
    expect(secondSeed).not.toBe(initialSeed);

    // The second (newer) seed should be at the top/first in the list
    await expect(recentButtons.nth(0)).toContainText(secondSeed!);
    await expect(recentButtons.nth(1)).toContainText(initialSeed!);

    // Click the first seed (initialSeed) to load it again
    const firstSeedBtn = recentButtons.nth(1);
    await firstSeedBtn.click();

    // Verify URL and display updated to initialSeed
    await expect(page).toHaveURL(new RegExp(`seed=${initialSeed}`));
    await expect(seedDisplay).toHaveText(initialSeed!);

    // Clicking it should also move it to the top of the list
    await expect(recentButtons.nth(0)).toContainText(initialSeed!);
    await expect(recentButtons.nth(1)).toContainText(secondSeed!);
  });
});
