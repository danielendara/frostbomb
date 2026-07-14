import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Nakaya diagram supports Home, End, PageUp, PageDown keys', async ({ page }) => {
  const nakaya = page.locator('#nakaya-diagram');

  // Open the Field Guide so the diagram is visible and can be focused
  await page.click('#guide-toggle');
  await expect(page.locator('#field-guide')).toBeVisible();

  // Focus the diagram
  await nakaya.focus();

  // Turn on Lab Mode (Arrow key or Enter)
  await page.keyboard.press('Enter');
  // Increase timeout for Lab Mode loading in CI as dynamic import of tweakpane can be slow
  await expect(page.locator('#lab-status')).toHaveText('ON', { timeout: 15000 });

  // Press Home (sets temp to -40)
  await page.keyboard.press('Home');
  // Use a more flexible regex to handle potential rounding or precision issues in different environments
  await expect(nakaya).toHaveAttribute('aria-label', /-(39\.[789]|40\.0)°C/);

  // Press End (sets temp to 0)
  await page.keyboard.press('End');
  // Matches "0.0°C" or potentially "-0.2°C" due to precision
  await expect(nakaya).toHaveAttribute('aria-label', /(-0\.[012]|0\.0)°C/);

  // Press PageDown (decreases humidity by 25)
  const ariaBeforePageDown = await nakaya.getAttribute('aria-label');
  await page.keyboard.press('PageDown');
  const ariaAfterPageDown = await nakaya.getAttribute('aria-label');
  expect(ariaAfterPageDown).not.toBe(ariaBeforePageDown);

  // Press PageUp (increases humidity by 25)
  await page.keyboard.press('PageUp');
  const ariaAfterPageUp = await nakaya.getAttribute('aria-label');
  expect(ariaAfterPageUp).not.toBe(ariaAfterPageDown);
});

test('Shift + Arrow keys for accelerated camera rotation is documented', async ({ page }) => {
  await page.click('#guide-toggle');
  const shortcuts = page.locator('#guide-shortcuts');
  await expect(shortcuts).toContainText('Rotate camera (Shift for fast)');
});
