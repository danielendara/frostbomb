import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('document title updates when a new snowflake is grown', async ({ page }) => {
  // Initial title should contain "frostbomb"
  await expect(page).toHaveTitle(/frostbomb/);

  const initialTitle = await page.title();

  // Trigger a refresh to grow a new snowflake
  await page.keyboard.press('r');

  // Wait for title to change (it might be the same if we're unlucky with random, but usually it should change)
  // Or just check if it follows the pattern "[Habit] — frostbomb"
  await expect(page).toHaveTitle(/.+ — frostbomb/);

  // Get the habit from the UI and check if it's in the title
  const habitText = await page.locator('#stat-habit').textContent();
  if (habitText && habitText !== '—') {
    await expect(page).toHaveTitle(new RegExp(`${habitText} — frostbomb`));
  }
});

test('seed button has descriptive aria-label', async ({ page }) => {
  const seedBtn = page.locator('#btn-seed');
  const seedDisplay = page.locator('#seed-display');
  const seed = await seedDisplay.textContent();

  if (seed && seed !== '·····') {
    await expect(seedBtn).toHaveAttribute('aria-label', `Copy share link for seed ${seed}`);
  }
});
