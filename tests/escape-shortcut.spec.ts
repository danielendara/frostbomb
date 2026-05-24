import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Escape key closes the Field Guide', async ({ page }) => {
  const fieldGuide = page.locator('#field-guide');
  const guideToggle = page.locator('#guide-toggle');

  // Open guide
  await guideToggle.click();
  await expect(fieldGuide).toBeVisible();

  // Press Escape
  await page.keyboard.press('Escape');
  await expect(fieldGuide).not.toBeVisible();
  await expect(guideToggle).toHaveAttribute('aria-expanded', 'false');
});

test('Escape key closes Lab Mode', async ({ page }) => {
  const labControls = page.locator('#lab-controls');
  const labToggle = page.locator('#lab-toggle');

  // Open Lab Mode
  await labToggle.click();
  await expect(labControls).toBeVisible();

  // Press Escape
  await page.keyboard.press('Escape');
  await expect(labControls).not.toBeVisible();
  await expect(labToggle).toHaveAttribute('aria-expanded', 'false');
});

test('Escape key closes Lab Mode even when a control is focused', async ({ page }) => {
  const labControls = page.locator('#lab-controls');
  const labToggle = page.locator('#lab-toggle');

  // Open Lab Mode
  await labToggle.click();
  await expect(labControls).toBeVisible();

  // Focus a slider (Tweakpane uses inputs for sliders)
  // Using a more generic selector that Tweakpane usually has
  const slider = page.locator('#pane-mount input');
  await slider.first().waitFor();
  await slider.first().focus();

  // Press Escape
  await page.keyboard.press('Escape');
  await expect(labControls).not.toBeVisible();
  await expect(labToggle).toHaveAttribute('aria-expanded', 'false');
});
