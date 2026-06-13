import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('R key regrows the snowflake', async ({ page }) => {
  const initialSeed = await page.textContent('#seed-display');
  await page.keyboard.press('r');
  // Wait a bit for the seed to change
  await expect(async () => {
    const newSeed = await page.textContent('#seed-display');
    expect(newSeed).not.toBe(initialSeed);
  }).toPass();
});

test('keyboard shortcuts provide tactile button feedback', async ({ page }) => {
  const refresh = page.locator('#refresh');

  await page.keyboard.press('r');

  await expect(refresh).toHaveClass(/btn-press/);
});

test('V key provides feedback on the reset-view button', async ({ page }) => {
  const reset = page.getByRole('button', { name: 'Reset' });

  await page.keyboard.press('v');

  await expect(reset).toHaveClass(/btn-press/);
});

test('modified shortcuts do not trigger app actions', async ({ page }) => {
  const initialSeed = await page.textContent('#seed-display');

  await page.keyboard.press('Control+r');

  await expect(page.locator('#seed-display')).toHaveText(initialSeed ?? '');
});

test('regrowing spins the wordmark accent once', async ({ page }) => {
  const accent = page.locator('.wordmark__accent');

  await page.keyboard.press('r');

  await expect(accent).toHaveClass(/animate-spin-once/);
});

test('field guide documents the reset-view shortcut', async ({ page }) => {
  await page.keyboard.press('g');

  const resetShortcut = page.locator('.shortcut-item').filter({ hasText: 'Reset 3D view' });
  await expect(resetShortcut.locator('dt')).toHaveText('V');
});

test('wordmark links back to the root path', async ({ page }) => {
  const wordmark = page.getByRole('link', { name: 'Grow a new frostbomb snowflake' });

  await expect(wordmark).toHaveAttribute('href', '/');
});

test('L key toggles lab mode', async ({ page }) => {
  const labControls = page.locator('#lab-controls');
  await expect(labControls).not.toBeVisible();

  await page.keyboard.press('l');
  await expect(labControls).toBeVisible();

  await page.keyboard.press('l');
  await expect(labControls).not.toBeVisible();
});

test('shortcuts are ignored while editing lab controls', async ({ page }) => {
  await page.keyboard.press('l');
  await expect(page.locator('#lab-controls')).toBeVisible();

  const tempInput = page.getByRole('textbox').first();
  await tempInput.focus();
  await page.keyboard.press('p');
  await page.keyboard.press('l');

  await expect(page.locator('#btn-pink')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#lab-controls')).toBeVisible();
});

test('S key triggers save (downloads file)', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.keyboard.press('s');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^frostbomb-.*-.*\.png$/);
});
