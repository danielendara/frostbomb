import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Clicking growth condition row opens field guide and scrolls to section', async ({ page }) => {
  const tempRow = page.locator('.field-notes__row', { hasText: 'Temperature' });
  const fieldGuide = page.locator('#field-guide');
  const tempSection = page.locator('#guide-temp');

  await expect(fieldGuide).not.toBeVisible();

  await tempRow.click();

  await expect(fieldGuide).toBeVisible();
  await expect(tempSection).toBeInViewport();
});

test('Keyboard activation of growth condition row works', async ({ page }) => {
  const fieldGuide = page.locator('#field-guide');
  const habitSection = page.locator('#guide-habit');

  await expect(fieldGuide).not.toBeVisible();

  await page.keyboard.press('Tab'); // masthead link
  await page.keyboard.press('Tab'); // seed button
  await page.keyboard.press('Tab'); // guide toggle
  await page.keyboard.press('Tab'); // lab toggle
  await page.keyboard.press('Tab'); // Temperature row
  await page.keyboard.press('Tab'); // Supersaturation row
  await page.keyboard.press('Tab'); // Habit row

  await page.keyboard.press('Enter');

  await expect(fieldGuide).toBeVisible();
  await expect(habitSection).toBeInViewport();
});
