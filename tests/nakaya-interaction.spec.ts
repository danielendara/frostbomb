import { test, expect } from '@playwright/test';

test('Nakaya diagram interaction updates growth conditions', async ({ page }) => {
  await page.goto('/');

  // Initial lab status should be OFF
  await expect(page.locator('#lab-status')).toHaveText('OFF');

  // Open the field guide
  const guideToggle = page.locator('#guide-toggle');
  await guideToggle.click();

  // Wait for the diagram
  const diagram = page.locator('#nakaya-diagram');
  await expect(diagram).toBeVisible();

  // Log diagram position
  const box = await diagram.boundingBox();
  console.log('Diagram box:', box);

  if (box) {
    // Click on the diagram.
    // Try to click in the middle
    await diagram.click({ position: { x: box.width / 2, y: box.height / 2 } });
  }

  // Lab mode should now be active.
  const labStatus = page.locator('#lab-status');

  // Wait for lab mode to be ON
  await expect(labStatus).toHaveText('ON', { timeout: 15000 });
});

test('Nakaya diagram keyboard interaction', async ({ page }) => {
  await page.goto('/');

  // Open the field guide
  await page.locator('#guide-toggle').click();

  // Focus the diagram
  const diagram = page.locator('#nakaya-diagram');
  await diagram.focus();

  // Press Arrow keys
  await page.keyboard.press('ArrowLeft');

  // Lab mode should now be active
  const labStatus = page.locator('#lab-status');
  await expect(labStatus).toHaveText('ON');
});
