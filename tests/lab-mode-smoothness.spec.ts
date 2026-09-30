import { test, expect } from '@playwright/test';

test('Lab mode slider changes do not trigger growth animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  // Toggle Lab Mode
  await page.keyboard.press('l');

  // Wait for Lab Mode controls to be visible
  await expect(page.locator('#lab-controls')).toBeVisible();

  const tempInput = page.locator('.tp-lblv:has-text("Temp (°C)") input');
  await expect(tempInput).toBeVisible();
  const humidityInput = page.locator('.tp-lblv:has-text("Humidity (%)") input');

  const scene = page.locator('#scene');
  const commitPaneInput = async () => {
    await scene.click({ position: { x: 10, y: 10 } });
  };

  // Set both parameters to ensure a deterministic habit regardless of the initial random flake
  await tempInput.fill('-20');
  await commitPaneInput();

  await humidityInput.fill('60');
  await commitPaneInput();

  await expect(scene).toHaveAttribute('data-entry-active', 'false');
  await expect(scene).toHaveAttribute('data-entry-progress', '1.000');

  const habitText = page.locator('#stat-habit');
  // At -20C and 60% humidity, getHabit returns 'stellar_dendrite'
  await expect(habitText).toHaveText(/Stellar dendrite/i);

  await tempInput.fill('-5');
  await commitPaneInput();
  await expect(scene).toHaveAttribute('data-entry-active', 'false');
  await expect(scene).toHaveAttribute('data-entry-progress', '1.000');
  await expect(habitText).toHaveText(/Needle/i);
});
