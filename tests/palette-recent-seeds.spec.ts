import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Recent Seeds tracks, persists, displays, and triggers regrowing of previous seeds', async ({ page }) => {
  // Clear any existing localStorage before starting the test
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.goto('/');

  const recentSeedsContainer = page.locator('#recent-seeds-container');
  const recentSeedsList = page.locator('#recent-seeds-list');
  const seedDisplay = page.locator('#seed-display');

  // Let first seed load
  await expect(seedDisplay).not.toHaveText('·····');
  const firstSeed = (await seedDisplay.textContent())?.trim() || '';
  expect(firstSeed).toMatch(/^[a-z0-9]{5}$/i);

  // Growth should trigger adding to recent seeds
  await expect(recentSeedsContainer).toBeVisible();
  const seedButtonsBefore = recentSeedsList.locator('button');
  await expect(seedButtonsBefore).toHaveCount(1);
  await expect(seedButtonsBefore.first()).toHaveText(firstSeed);

  // Grow another one by clicking the refresh button
  const refreshBtn = page.locator('#refresh');
  await refreshBtn.click();

  // Wait for new seed
  await expect(async () => {
    const currentSeed = (await seedDisplay.textContent())?.trim() || '';
    expect(currentSeed).not.toBe(firstSeed);
  }).toPass({ timeout: 5000 });

  const secondSeed = (await seedDisplay.textContent())?.trim() || '';
  expect(secondSeed).toMatch(/^[a-z0-9]{5}$/i);

  // Now container should have both seeds in the correct order (most recent first)
  const seedButtonsAfter = recentSeedsList.locator('button');
  await expect(seedButtonsAfter).toHaveCount(2);
  await expect(seedButtonsAfter.first()).toHaveText(secondSeed);
  await expect(seedButtonsAfter.nth(1)).toHaveText(firstSeed);

  // Test clicking the first seed button restores it
  await seedButtonsAfter.nth(1).click();
  await expect(seedDisplay).toHaveText(firstSeed);

  // Test persistence across reloads
  await page.reload();
  await expect(seedDisplay).not.toHaveText('·····');
  await expect(recentSeedsContainer).toBeVisible();
  await expect(recentSeedsList.locator('button')).toHaveCount(2);

  // The first button in list should be the active one
  await expect(recentSeedsList.locator('button').first()).toHaveText(firstSeed);
});

test('Recent Seeds is hidden when Lab Mode or Field Guide is active', async ({ page }) => {
  const recentSeedsContainer = page.locator('#recent-seeds-container');
  await expect(recentSeedsContainer).toBeVisible();

  // Activate Lab Mode
  await page.click('#lab-toggle');
  await expect(recentSeedsContainer).not.toBeVisible();

  // Deactivate Lab Mode
  await page.click('#lab-toggle');
  await expect(recentSeedsContainer).toBeVisible();

  // Activate Guide Mode
  await page.click('#guide-toggle');
  await expect(recentSeedsContainer).not.toBeVisible();
});
