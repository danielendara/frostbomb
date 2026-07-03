import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Clicking growth condition row opens field guide and scrolls to section', async ({ page }) => {
  const tempRow = page.locator('.field-notes__row', { hasText: 'Temperature' });
  const fieldGuide = page.locator('#field-guide');
  const tempSection = page.locator('#guide-temp');

  // Initial state: guide is closed
  await expect(fieldGuide).not.toBeVisible();

  // Click Temperature row
  await tempRow.click();

  // Expect guide to open
  await expect(fieldGuide).toBeVisible();

  // Expect section to be in viewport (approximately)
  await expect(tempSection).toBeInViewport();
});

test('Keyboard activation of growth condition row works', async ({ page }) => {
  const habitRow = page.locator('.field-notes__row', { hasText: 'Habit' });
  const fieldGuide = page.locator('#field-guide');
  const habitSection = page.locator('#guide-habit');

  // Initial state: guide is closed
  await expect(fieldGuide).not.toBeVisible();

  // Tab to Habit row (it has tabindex="0")
  // Temperature, Supersaturation, Habit are the first 3 rows
  await page.keyboard.press('Tab'); // masthead link
  await page.keyboard.press('Tab'); // seed button
  await page.keyboard.press('Tab'); // guide toggle
  await page.keyboard.press('Tab'); // lab toggle
  await page.keyboard.press('Tab'); // Temperature row
  await page.keyboard.press('Tab'); // Supersaturation row
  await page.keyboard.press('Tab'); // Habit row

  // Press Enter
  await page.keyboard.press('Enter');

  // Expect guide to open
  await expect(fieldGuide).toBeVisible();
  await expect(habitSection).toBeInViewport();
});
