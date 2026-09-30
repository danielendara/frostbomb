import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('document title updates when a new snowflake is grown', async ({ page }) => {
  await expect(page).toHaveTitle(/frostbomb/);

  await page.keyboard.press('r');

  await expect(page).toHaveTitle(/.+ — frostbomb/);

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
