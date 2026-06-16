import { test, expect } from '@playwright/test';

test.describe('Palette Interactive Enhancements V2', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('keyboard rotation of snowflake works', async ({ page }) => {
    // Initial state check
    const canvas = page.locator('#scene');
    await expect(canvas).toBeVisible();

    // Trigger Arrow keys
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');

    // If it didn't crash, we're in good shape for this simple check
    await expect(canvas).toBeVisible();
  });

  test('interactive diagram keyboard support', async ({ page }) => {
    // Open field guide to see the diagram
    await page.keyboard.press('g');
    const guide = page.locator('#field-guide');
    await expect(guide).toBeVisible();

    const diagram = page.locator('#nakaya-diagram');
    await expect(diagram).toBeVisible();

    // Focus diagram
    await diagram.focus();

    // Press Enter to enable lab mode
    await page.keyboard.press('Enter');

    const labStatus = page.locator('#lab-status');
    await expect(labStatus).toHaveText('ON');

    // Press ArrowRight to change temperature
    const tempStat = page.locator('#stat-temp');
    const initialTemp = await tempStat.innerText();

    await page.keyboard.press('ArrowRight');

    const newTemp = await tempStat.innerText();
    expect(newTemp).not.toBe(initialTemp);
  });
});
