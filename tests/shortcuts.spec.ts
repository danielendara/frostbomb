import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:5173');
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

test('L key toggles lab mode', async ({ page }) => {
  const labControls = page.locator('#lab-controls');
  await expect(labControls).not.toBeVisible();

  await page.keyboard.press('l');
  await expect(labControls).toBeVisible();

  await page.keyboard.press('l');
  await expect(labControls).not.toBeVisible();
});

test('B key toggles bloom', async ({ page }) => {
  const bloomBtn = page.locator('#btn-bloom');
  await expect(bloomBtn).toHaveClass(/active/);

  await page.keyboard.press('b');
  await expect(bloomBtn).not.toHaveClass(/active/);

  await page.keyboard.press('b');
  await expect(bloomBtn).toHaveClass(/active/);
});

test('S key triggers save (downloads file)', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.keyboard.press('s');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^frostbomb-.*-.*\.png$/);
});
