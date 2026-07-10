import { test, expect } from '@playwright/test';

test('pressing ? opens field guide and scrolls to shortcuts', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Ensure guide is closed initially
  const guide = page.locator('#field-guide');
  await expect(guide).toBeHidden();

  // Press ?
  await page.keyboard.press('?');

  // Guide should be visible
  await expect(guide).toBeVisible();

  // Keyboard shortcuts section should be in view and focused
  const shortcutsSection = page.locator('#guide-shortcuts');
  await expect(shortcutsSection).toBeVisible();

  // Check if it has focus (programmatic focus via tabindex="-1")
  const isFocused = await shortcutsSection.evaluate(el => document.activeElement === el);
  expect(isFocused).toBe(true);

  // Verify highlight animation class was added
  await expect(shortcutsSection).toHaveClass(/section-highlight/);

  console.log('Successfully verified ? shortcut navigation to Keyboard Shortcuts section.');
});
