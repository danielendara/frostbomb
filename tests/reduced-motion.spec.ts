import { test, expect } from '@playwright/test';

test('reduced motion disables auto-rotation and entry animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.locator('#btn-rotate')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#scene')).toHaveAttribute('data-entry-active', 'false');
  await expect(page.locator('#scene')).toHaveAttribute('data-entry-progress', '1.000');
});
