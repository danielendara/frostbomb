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

test('Arrow keys on a focused Lab slider change Temp without orbiting the camera', async ({ page }) => {
  await page.goto('/?seed=frost42');
  await page.waitForFunction(() => typeof (window as any).__FROSTBOMB_DRAG__ === 'function');
  await page.keyboard.press('l');
  await expect(page.locator('#lab-controls')).toBeVisible();

  const row = page.locator('#pane-mount .tp-lblv:has-text("Temp (°C)")');
  const knob = row.locator('.tp-sldv_t');
  const tempInput = row.locator('input');
  await expect(tempInput).toBeVisible();

  const readDrag = () => page.evaluate(() => (window as any).__FROSTBOMB_DRAG__() as { x: number; y: number });
  const dragBefore = await readDrag();
  const tempBefore = await tempInput.inputValue();

  await knob.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');

  await expect.poll(() => tempInput.inputValue()).not.toBe(tempBefore);
  const dragAfter = await readDrag();
  expect(dragAfter.x).toBe(dragBefore.x);
  expect(dragAfter.y).toBe(dragBefore.y);
});
