import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:5173');
});

test('Guide button toggles field guide visibility', async ({ page }) => {
  const fieldGuide = page.locator('#field-guide');
  const statsDisplay = page.locator('#stats-display');
  const guideToggle = page.locator('#guide-toggle');

  await expect(fieldGuide).not.toBeVisible();
  await expect(statsDisplay).toBeVisible();

  await guideToggle.click();
  await expect(fieldGuide).toBeVisible();
  await expect(statsDisplay).not.toBeVisible();
  await expect(guideToggle).toHaveAttribute('aria-pressed', 'true');

  await guideToggle.click();
  await expect(fieldGuide).not.toBeVisible();
  await expect(statsDisplay).toBeVisible();
  await expect(guideToggle).toHaveAttribute('aria-pressed', 'false');
});

test('Field guide contains expected terminology', async ({ page }) => {
  const guideToggle = page.locator('#guide-toggle');
  await guideToggle.click();

  const content = page.locator('#field-guide');
  await expect(content).toContainText('Temperature');
  await expect(content).toContainText('Supersaturation');
  await expect(content).toContainText('Habit');
  await expect(content).toContainText('Nakaya Diagram');
});

test('Guide and Lab Mode are mutually exclusive', async ({ page }) => {
  const guideToggle = page.locator('#guide-toggle');
  const labToggle = page.locator('#lab-toggle');
  const fieldGuide = page.locator('#field-guide');
  const labControls = page.locator('#lab-controls');

  // Open guide
  await guideToggle.click();
  await expect(fieldGuide).toBeVisible();
  await expect(labControls).not.toBeVisible();

  // Open lab mode, guide should close
  await labToggle.click();
  await expect(labControls).toBeVisible();
  await expect(fieldGuide).not.toBeVisible();
  await expect(guideToggle).toHaveAttribute('aria-pressed', 'false');

  // Open guide again, lab mode should close
  await guideToggle.click();
  await expect(fieldGuide).toBeVisible();
  await expect(labControls).not.toBeVisible();
  await expect(labToggle).toHaveAttribute('aria-pressed', 'false');
});
