import { test, expect } from '@playwright/test';

test('Lab mode slider changes do not trigger growth animation', async ({ page }) => {
  await page.goto('/');

  await page.keyboard.press('l');
  const labControls = page.locator('#lab-controls');
  await expect(labControls).toBeVisible();

  await expect(page.getByRole('button', { name: 'Growth parameters' })).toBeVisible();

  const tempSlider = page.getByRole('textbox').first();
  const scene = page.locator('#scene');

  await tempSlider.fill('-20');
  await tempSlider.press('Enter');

  await expect(scene).toHaveAttribute('data-entry-active', 'false');
  await expect(scene).toHaveAttribute('data-entry-progress', '1.000');

  const habitText = page.locator('#stat-habit');
  await expect(habitText).toHaveText(/Stellar dendrite/i);

  await tempSlider.fill('-5');
  await tempSlider.press('Enter');
  await expect(scene).toHaveAttribute('data-entry-active', 'false');
  await expect(scene).toHaveAttribute('data-entry-progress', '1.000');
  await expect(habitText).toHaveText(/Needle/i);
});
