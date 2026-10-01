import { test, expect } from '@playwright/test';

test('pressing ? opens field guide and scrolls to shortcuts', async ({ page }) => {
  await page.goto('/');

  const guide = page.locator('#field-guide');
  await expect(guide).toBeHidden();

  await page.keyboard.press('?');

  await expect(guide).toBeVisible();

  const shortcutsSection = page.locator('#guide-shortcuts');
  await expect(shortcutsSection).toBeVisible();

  await expect(shortcutsSection).toBeFocused();

  await expect(shortcutsSection).toHaveClass(/section-highlight/);
});
