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

  // Clear button should display item count and dynamic aria-label/title
  const clearBtn = page.locator('#btn-clear-history');
  await expect(clearBtn).toHaveText('Clear (1)');
  await expect(clearBtn).toHaveAttribute('title', 'Clear seed history (1 item)');
  await expect(clearBtn).toHaveAttribute('aria-label', 'Clear seed history (1 item)');

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

  const firstBox = await seedButtonsAfter.first().boundingBox();
  const secondBox = await seedButtonsAfter.nth(1).boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  expect(secondBox!.x).toBeGreaterThanOrEqual(firstBox!.x + firstBox!.width);

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

test('Recent Seeds is hidden when Lab Mode is active', async ({ page }) => {
  test.slow();
  const recentSeedsContainer = page.locator('#recent-seeds-container');
  const seedDisplay = page.locator('#seed-display');
  const labToggle = page.locator('#lab-toggle');

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
});

test('Recent Seeds is hidden when Field Guide is active', async ({ page }) => {
  test.slow();
  const recentSeedsContainer = page.locator('#recent-seeds-container');
  const seedDisplay = page.locator('#seed-display');
  const guideToggle = page.locator('#guide-toggle');

  // Wait for seed to generate so container becomes visible
  await expect(seedDisplay).not.toHaveText('·····');
  await expect(recentSeedsContainer).toBeVisible();

  // 1. Activate Guide Mode
  await guideToggle.click();
  // Wait for the UI state to update to active
  await expect(guideToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(recentSeedsContainer).not.toBeVisible();

  // 2. Deactivate Guide Mode
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

  // Set the undo timeout to 0 for this test so the history is immediately fully cleared
  await page.evaluate(() => { (window as any).__FROSTBOMB_UNDO_TIMEOUT__ = 0; });

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

test('Recent Seeds clearing can be undone, restoring items and focusing clear button', async ({ page }) => {
  // Set the undo timeout to 60000ms to ensure the undo container remains stable on slow CI environments
  await page.evaluate(() => { (window as any).__FROSTBOMB_UNDO_TIMEOUT__ = 60000; });

  const recentSeedsContainer = page.locator('#recent-seeds-container');
  const recentSeedsList = page.locator('#recent-seeds-list');
  const seedDisplay = page.locator('#seed-display');
  const clearBtn = page.locator('#btn-clear-history');

  // Wait for seed to generate so container becomes visible
  await expect(seedDisplay).not.toHaveText('·····');
  const activeSeed = (await seedDisplay.textContent())?.trim() || '';

  // Click the clear button
  await clearBtn.click();

  // Container should remain visible and show 'Undo' button
  await expect(recentSeedsContainer).toBeVisible();
  const undoBtn = page.locator('#btn-undo-history');
  await expect(undoBtn).toBeVisible();
  await expect(undoBtn).toHaveClass(/undo-armed/);
  await expect(recentSeedsContainer).toHaveClass(/undo-armed/);

  // Undo button should receive focus
  await expect(undoBtn).toBeFocused();

  // Click the undo button
  await undoBtn.click();

  // Seed history should be restored, showing the button back
  const seedButtons = recentSeedsList.locator('button');
  await expect(seedButtons).toHaveCount(1);
  await expect(seedButtons.first()).toHaveText(activeSeed);
  await expect(recentSeedsContainer).not.toHaveClass(/undo-armed/);
  await expect(page.locator('#btn-undo-history')).toHaveCount(0);

  // Clear button should receive focus
  await expect(clearBtn).toBeFocused();

  // Verify localStorage has been restored
  const storedValue = await page.evaluate(() => localStorage.getItem('frostbomb-recent-seeds'));
  expect(storedValue).not.toBeNull();
  expect(JSON.parse(storedValue || '[]')).toContain(activeSeed);
});

test('Recent Seeds buttons support keyboard Arrow key navigation', async ({ page }) => {
  const recentSeedsContainer = page.locator('#recent-seeds-container');
  const recentSeedsList = page.locator('#recent-seeds-list');
  const seedDisplay = page.locator('#seed-display');

  // Let first seed load
  await expect(seedDisplay).not.toHaveText('·····');
  const firstSeed = (await seedDisplay.textContent())?.trim() || '';

  // Grow another one by clicking the refresh button
  const refreshBtn = page.locator('#refresh');
  await refreshBtn.click();

  // Wait for new seed
  await expect(async () => {
    const currentSeed = (await seedDisplay.textContent())?.trim() || '';
    expect(currentSeed).not.toBe(firstSeed);
  }).toPass({ timeout: 5000 });

  const secondSeed = (await seedDisplay.textContent())?.trim() || '';

  // Ensure both buttons are present
  const seedButtons = recentSeedsList.locator('button');
  await expect(seedButtons).toHaveCount(2);

  // Verify initial roving tabindex states
  await expect(seedButtons.first()).toHaveAttribute('tabindex', '0');
  await expect(seedButtons.nth(1)).toHaveAttribute('tabindex', '-1');

  // Focus the first button
  await seedButtons.first().focus();
  await expect(seedButtons.first()).toBeFocused();
  await expect(seedButtons.first()).toHaveAttribute('tabindex', '0');
  await expect(seedButtons.nth(1)).toHaveAttribute('tabindex', '-1');

  // ArrowRight/ArrowDown should move focus to the second button
  await page.keyboard.press('ArrowRight');
  await expect(seedButtons.nth(1)).toBeFocused();
  await expect(seedButtons.first()).toHaveAttribute('tabindex', '-1');
  await expect(seedButtons.nth(1)).toHaveAttribute('tabindex', '0');

  // ArrowRight/ArrowDown should wrap focus back to the first button
  await page.keyboard.press('ArrowDown');
  await expect(seedButtons.first()).toBeFocused();
  await expect(seedButtons.first()).toHaveAttribute('tabindex', '0');
  await expect(seedButtons.nth(1)).toHaveAttribute('tabindex', '-1');

  // ArrowLeft/ArrowUp should wrap focus to the second button
  await page.keyboard.press('ArrowLeft');
  await expect(seedButtons.nth(1)).toBeFocused();
  await expect(seedButtons.first()).toHaveAttribute('tabindex', '-1');
  await expect(seedButtons.nth(1)).toHaveAttribute('tabindex', '0');

  // ArrowLeft/ArrowUp should move focus back to the first button
  await page.keyboard.press('ArrowUp');
  await expect(seedButtons.first()).toBeFocused();
  await expect(seedButtons.first()).toHaveAttribute('tabindex', '0');
  await expect(seedButtons.nth(1)).toHaveAttribute('tabindex', '-1');
});

test('Second Clear during the undo window does not wipe the seed backup', async ({ page }) => {
  await page.evaluate(() => { (window as any).__FROSTBOMB_UNDO_TIMEOUT__ = 60000; });

  const recentSeedsList = page.locator('#recent-seeds-list');
  const seedDisplay = page.locator('#seed-display');
  const clearBtn = page.locator('#btn-clear-history');

  await expect(seedDisplay).not.toHaveText('·····');
  const activeSeed = (await seedDisplay.textContent())?.trim() || '';

  await expect(clearBtn).toBeVisible();
  await expect(clearBtn).toBeEnabled();
  await clearBtn.click();

  const undoBtn = page.locator('#btn-undo-history');
  await expect(undoBtn).toBeVisible();
  await expect(undoBtn).toBeFocused();

  // Header Clear control must not remain clickable while Undo is showing
  await expect(clearBtn).toBeHidden();
  await expect(clearBtn).toBeDisabled();

  // Force a second Clear (the previous bug overwrote backupRecentSeeds with [])
  await clearBtn.dispatchEvent('click');

  await expect(undoBtn).toBeVisible();
  await undoBtn.click();

  const seedButtons = recentSeedsList.locator('button');
  await expect(seedButtons).toHaveCount(1);
  await expect(seedButtons.first()).toHaveText(activeSeed);
  await expect(clearBtn).toBeVisible();
  await expect(clearBtn).toBeEnabled();

  const storedValue = await page.evaluate(() => localStorage.getItem('frostbomb-recent-seeds'));
  expect(JSON.parse(storedValue || '[]')).toContain(activeSeed);
});

test('Masthead seed and recent seeds list are labelled but not live regions', async ({ page }) => {
  const recentSeedsList = page.locator('#recent-seeds-list');
  const announcer = page.locator('#a11y-announcer');
  const seedDisplay = page.locator('#seed-display');

  await expect(seedDisplay).not.toHaveText('·····');
  await expect(recentSeedsList).toBeVisible();

  await expect(seedDisplay).not.toHaveAttribute('aria-live');
  await expect(recentSeedsList).not.toHaveAttribute('aria-live');
  await expect(recentSeedsList).toHaveAttribute('aria-labelledby', 'recent-seeds-label');
  await expect(announcer).toHaveAttribute('aria-live', 'polite');
  await expect(announcer).toHaveAttribute('role', 'status');
});

test('Lab Mode grow during the undo window does not wipe the seed backup', async ({ page }) => {
  test.slow();
  await page.evaluate(() => { (window as any).__FROSTBOMB_UNDO_TIMEOUT__ = 60000; });

  const recentSeedsList = page.locator('#recent-seeds-list');
  const seedDisplay = page.locator('#seed-display');
  const clearBtn = page.locator('#btn-clear-history');
  const labToggle = page.locator('#lab-toggle');
  const refreshBtn = page.locator('#refresh');

  await expect(seedDisplay).not.toHaveText('·····');
  const firstSeed = (await seedDisplay.textContent())?.trim() || '';

  await refreshBtn.click();
  await expect(async () => {
    const currentSeed = (await seedDisplay.textContent())?.trim() || '';
    expect(currentSeed).not.toBe(firstSeed);
  }).toPass({ timeout: 5000 });
  const secondSeed = (await seedDisplay.textContent())?.trim() || '';

  await expect(recentSeedsList.locator('button')).toHaveCount(2);

  await clearBtn.click();
  const undoBtn = page.locator('#btn-undo-history');
  await expect(undoBtn).toBeVisible();
  await expect(undoBtn).toBeFocused();

  await labToggle.click();
  await expect(labToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#lab-controls')).toBeVisible();
  await expect(page.locator('#lab-status')).toHaveText('ON');
  await expect(labToggle).toBeEnabled();

  await labToggle.click();
  await expect(labToggle).toHaveAttribute('aria-pressed', 'false');

  await expect(undoBtn).toBeVisible();
  await undoBtn.click();

  const seedButtons = recentSeedsList.locator('button');
  await expect(seedButtons).toHaveCount(2);
  await expect(seedButtons.first()).toHaveText(secondSeed);
  await expect(seedButtons.nth(1)).toHaveText(firstSeed);
  await expect(clearBtn).toBeVisible();
  await expect(clearBtn).toBeEnabled();

  const storedValue = await page.evaluate(() => localStorage.getItem('frostbomb-recent-seeds'));
  expect(JSON.parse(storedValue || '[]')).toEqual([secondSeed, firstSeed]);
});

test('Clear history undo stays visually armed until timeout, then chrome returns to normal', async ({ page }) => {
  await page.evaluate(() => { (window as any).__FROSTBOMB_UNDO_TIMEOUT__ = 800; });

  const recentSeedsContainer = page.locator('#recent-seeds-container');
  const seedDisplay = page.locator('#seed-display');
  const clearBtn = page.locator('#btn-clear-history');

  await expect(seedDisplay).not.toHaveText('·····');
  await expect(recentSeedsContainer).toBeVisible();

  await clearBtn.click();
  const undoBtn = page.locator('#btn-undo-history');
  await expect(undoBtn).toBeVisible();
  await expect(undoBtn).toHaveClass(/undo-armed/);
  await expect(recentSeedsContainer).toHaveClass(/undo-armed/);
  await expect(undoBtn).toHaveCSS('border-color', 'rgb(158, 201, 255)');

  await expect(recentSeedsContainer).not.toBeVisible({ timeout: 5000 });
  await expect(undoBtn).not.toBeVisible();
  await expect(recentSeedsContainer).not.toHaveClass(/undo-armed/);
});

test('History undo pulse is disabled when prefers-reduced-motion is set', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { (window as any).__FROSTBOMB_UNDO_TIMEOUT__ = 60000; });

  const seedDisplay = page.locator('#seed-display');
  const clearBtn = page.locator('#btn-clear-history');

  await expect(seedDisplay).not.toHaveText('·····');
  await clearBtn.click();

  const undoBtn = page.locator('#btn-undo-history');
  await expect(undoBtn).toBeVisible();
  await expect(undoBtn).toHaveClass(/undo-armed/);
  await expect(undoBtn).toHaveCSS('animation-name', 'none');
});

test('Recent Seeds buttons announce state on click', async ({ page }) => {
  const recentSeedsList = page.locator('#recent-seeds-list');
  const seedDisplay = page.locator('#seed-display');
  const announcer = page.locator('#a11y-announcer');

  // Let first seed load
  await expect(seedDisplay).not.toHaveText('·····');
  const firstSeed = (await seedDisplay.textContent())?.trim() || '';

  // Grow another seed
  const refreshBtn = page.locator('#refresh');
  await refreshBtn.click();

  await expect(async () => {
    const currentSeed = (await seedDisplay.textContent())?.trim() || '';
    expect(currentSeed).not.toBe(firstSeed);
  }).toPass({ timeout: 5000 });

  const seedButtons = recentSeedsList.locator('button');
  await expect(seedButtons).toHaveCount(2);

  // Click active seed button (first button in list)
  await seedButtons.first().click();
  await expect(announcer).toContainText('is already active');

  // Click inactive seed button (second button in list)
  await seedButtons.nth(1).click();
  await expect(announcer).toContainText(`Loaded seed ${firstSeed}:`);
});
