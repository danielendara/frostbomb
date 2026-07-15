import { test, expect } from '@playwright/test';

test('Auto-Rotate button is disabled and updated when reduced motion is enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const btn = page.locator('#btn-rotate');
  await expect(btn).not.toBeDisabled();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveAttribute('title', 'Auto-rotation disabled (prefers-reduced-motion)');
  await expect(btn).toHaveAttribute('aria-pressed', 'false');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(btn).not.toBeDisabled();
  await expect(btn).toHaveAttribute('title', 'Toggle auto-rotation (A)');
});
