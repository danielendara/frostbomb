import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Interactive seed button exists and triggers copy', async ({ page }) => {
  const seedBtn = page.locator('#btn-seed');
  const seedDisplay = page.locator('#seed-display');

  await expect(seedBtn).toBeVisible();
  await expect(seedBtn).toHaveAttribute('title', 'Copy share link (C)');

  const initialSeed = await seedDisplay.textContent();
  expect(initialSeed).not.toBe('·····');

  // Trigger copy
  await seedBtn.click();

  // Check for feedback label
  await expect(seedDisplay).toHaveText('Copied!');

  // Check ARIA announcer
  const announcer = page.locator('#a11y-announcer');
  await expect(announcer).toHaveText('Link copied to clipboard');

  // Wait for it to revert
  await expect(seedDisplay).toHaveText(initialSeed!, { timeout: 3000 });
});

test('Copy Link button also shows feedback on Seed button', async ({ page }) => {
  const copyBtn = page.locator('#btn-copy');
  const seedDisplay = page.locator('#seed-display');
  const initialSeed = await seedDisplay.textContent();

  await copyBtn.click();

  await expect(seedDisplay).toHaveText('Copied!');
  await expect(copyBtn.locator('.action-btn__label')).toHaveText('Copied!');

  // Wait for it to revert
  await expect(seedDisplay).toHaveText(initialSeed!, { timeout: 3000 });
});

test('Keyboard shortcut (C) triggers copy and feedback', async ({ page }) => {
  const seedDisplay = page.locator('#seed-display');
  const initialSeed = await seedDisplay.textContent();

  await page.keyboard.press('c');

  await expect(seedDisplay).toHaveText('Copied!');
  await expect(page.locator('#btn-copy .action-btn__label')).toHaveText('Copied!');

  // Check visual press animation
  const btnCopy = page.locator('#btn-copy');
  await expect(btnCopy).toHaveClass(/btn-press/);

  // Wait for it to revert
  await expect(seedDisplay).toHaveText(initialSeed!, { timeout: 3000 });
});

test('Rapid clicks do not break the revert logic (race condition test)', async ({ page }) => {
  const seedBtn = page.locator('#btn-seed');
  const seedDisplay = page.locator('#seed-display');
  const initialSeed = await seedDisplay.textContent();

  await seedBtn.click();
  await page.waitForTimeout(500); // halfway through
  await expect(seedDisplay).toHaveText('Copied!');

  await seedBtn.click(); // Click again
  await expect(seedDisplay).toHaveText('Copied!');

  // Revert should still use the ORIGINAL seed, not "Copied!"
  await expect(seedDisplay).toHaveText(initialSeed!, { timeout: 3000 });
});

test('Save PNG button shows feedback', async ({ page }) => {
  const saveBtn = page.locator('#btn-save');
  const label = saveBtn.locator('.action-btn__label');
  const originalLabel = await label.textContent();

  // We mock download to avoid actual file saving if necessary, but here we just check label
  const downloadPromise = page.waitForEvent('download');
  await saveBtn.click();

  // Check feedback immediately after click to avoid timeout race conditions
  await expect(label).toHaveText('Saved!');
  await expect(saveBtn.locator('.action-btn__icon')).toHaveText('✓');

  await downloadPromise;

  // Check ARIA announcer
  const announcer = page.locator('#a11y-announcer');
  await expect(announcer).toHaveText('Snowflake saved as PNG');

  await expect(label).toHaveText(originalLabel!, { timeout: 3000 });
});
