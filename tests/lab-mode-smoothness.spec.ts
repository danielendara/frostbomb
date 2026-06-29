import { test, expect } from '@playwright/test';

test('Lab mode slider changes do not trigger growth animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  // Toggle Lab Mode
  await page.keyboard.press('l');

  // Wait for Lab Mode controls to be visible
  await expect(page.locator('#lab-controls')).toBeVisible();

  // Wait for Tweakpane to finish loading its internal components
  await page.waitForTimeout(2000);

  // Use more robust locators for Tweakpane inputs
  // Tweakpane inputs are often found by their associated label text
  const tempInput = page.locator('.tp-lblv_v input').first();
  const humidityInput = page.locator('.tp-lblv_v input').nth(2); // Skip Temp (F) which is nth(1) and readonly

  const scene = page.locator('#scene');

  // Set both parameters to ensure a deterministic habit regardless of the initial random flake
  await tempInput.fill('-20');
  await tempInput.press('Enter');

  await humidityInput.fill('60');
  await humidityInput.press('Enter');

  await expect(scene).toHaveAttribute('data-entry-active', 'false');
  await expect(scene).toHaveAttribute('data-entry-progress', '1.000');

  const habitText = page.locator('#stat-habit');
  // At -20C and 60% humidity, getHabit returns 'stellar_dendrite'
  await expect(habitText).toHaveText(/Stellar dendrite/i);

  await tempInput.fill('-5');
  await tempInput.press('Enter');
  await expect(scene).toHaveAttribute('data-entry-active', 'false');
  await expect(scene).toHaveAttribute('data-entry-progress', '1.000');
  await expect(habitText).toHaveText(/Needle/i);
});
