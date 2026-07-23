import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Recent Seeds tracks, persists, displays, and triggers regrowing of previous seeds', async ({ page }) => {
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
  const seedDisplay = page.locator('#seed-display');
  const labToggle = page.locator('#lab-toggle');
  const guideToggle = page.locator('#guide-toggle');

  // Wait for seed to generate so container becomes visible
  await expect(seedDisplay).not.toHaveText('·····');
  await expect(recentSeedsContainer).toBeVisible();

  // 1. Activate Lab Mode
  await labToggle.click();
  // Wait for the UI state to update to active
  await expect(labToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(recentSeedsContainer).not.toBeVisible();

  // 2. Deactivate Lab Mode
  await labToggle.click();
  // Wait for the UI state to update to inactive
  await expect(labToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(recentSeedsContainer).toBeVisible();

  // 3. Activate Guide Mode
  await guideToggle.click();
  // Wait for the UI state to update to active
  await expect(guideToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(recentSeedsContainer).not.toBeVisible();

  // 4. Deactivate Guide Mode
  await guideToggle.click();
  // Wait for the UI state to update to inactive
  await expect(guideToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(recentSeedsContainer).toBeVisible();
});

test('Recent Seeds can be cleared, updates localStorage and shifts focus to Guide toggle', async ({ page }) => {
  const recentSeedsContainer = page.locator('#recent-seeds-container');
  const recentSeedsList = page.locator('#recent-seeds-list');
  const seedDisplay = page.locator('#seed-display');
  const clearBtn = page.locator('#btn-clear-history');
  const guideToggle = page.locator('#guide-toggle');

  // Wait for seed to generate so container becomes visible
  await expect(seedDisplay).not.toHaveText('·····');
  await expect(recentSeedsContainer).toBeVisible();

  // Initially there should be 1 seed
  const seedButtonsBefore = recentSeedsList.locator('button');
  await expect(seedButtonsBefore).toHaveCount(1);

  // Click the clear button
  await clearBtn.click();

  // Container should now be hidden
  await expect(recentSeedsContainer).not.toBeVisible();

  // guide-toggle should receive focus
  await expect(guideToggle).toBeFocused();

  // Verify localStorage has been cleared
  const storedValue = await page.evaluate(() => localStorage.getItem('frostbomb-recent-seeds'));
  expect(storedValue).toBeNull();
});
