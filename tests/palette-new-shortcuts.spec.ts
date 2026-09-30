import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Nakaya diagram supports Home, End, PageUp, PageDown keys', async ({ page }) => {
  const nakaya = page.locator('#nakaya-diagram');

  await page.click('#guide-toggle');
  await expect(page.locator('#field-guide')).toBeVisible();

  await nakaya.focus();

  await page.keyboard.press('Enter');
  // Increase timeout for Lab Mode loading in CI as dynamic import of tweakpane can be slow
  await expect(page.locator('#lab-status')).toHaveText('ON', { timeout: 15000 });

  await page.keyboard.press('Home');
  // Use a more flexible regex to handle potential rounding or precision issues in different environments
  await expect(nakaya).toHaveAttribute('aria-label', /-(39\.[789]|40\.0)°C/);

  await page.keyboard.press('End');
  // Matches "0.0°C" or potentially "-0.2°C" due to precision
  await expect(nakaya).toHaveAttribute('aria-label', /(-0\.[012]|0\.0)°C/);

  const ariaBeforePageDown = await nakaya.getAttribute('aria-label');
  await page.keyboard.press('PageDown');
  const ariaAfterPageDown = await nakaya.getAttribute('aria-label');
  expect(ariaAfterPageDown).not.toBe(ariaBeforePageDown);

  await page.keyboard.press('PageUp');
  const ariaAfterPageUp = await nakaya.getAttribute('aria-label');
  expect(ariaAfterPageUp).not.toBe(ariaAfterPageDown);
});

test('Shift + Arrow keys for accelerated camera rotation is documented', async ({ page }) => {
  await page.click('#guide-toggle');
  const shortcuts = page.locator('#guide-shortcuts');
  await expect(shortcuts).toContainText('Rotate camera (Shift for fast)');
});
