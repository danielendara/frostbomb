import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Escape key closes the Field Guide', async ({ page }) => {
  const fieldGuide = page.locator('#field-guide');
  const guideToggle = page.locator('#guide-toggle');

  await guideToggle.click();
  await expect(fieldGuide).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(fieldGuide).not.toBeVisible();
  await expect(guideToggle).toHaveAttribute('aria-pressed', 'false');
});

test('Escape key closes Lab Mode', async ({ page }) => {
  const labControls = page.locator('#lab-controls');
  const labToggle = page.locator('#lab-toggle');

  await labToggle.click();
  await expect(labControls).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(labControls).not.toBeVisible();
  await expect(labToggle).toHaveAttribute('aria-pressed', 'false');
});

test('Escape key closes Lab Mode even when a control is focused', async ({ page }) => {
  const labControls = page.locator('#lab-controls');
  const labToggle = page.locator('#lab-toggle');

  await labToggle.click();
  await expect(labControls).toBeVisible();

  const slider = page.locator('#pane-mount input');
  await slider.first().waitFor();
  await slider.first().focus();

  await page.keyboard.press('Escape');
  await expect(labControls).not.toBeVisible();
  await expect(labToggle).toHaveAttribute('aria-pressed', 'false');
});
