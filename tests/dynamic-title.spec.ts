import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('document title updates when a new snowflake is grown', async ({ page }) => {
  await expect(page).toHaveTitle(/frostbomb/);

  await page.keyboard.press('r');

  await expect(page).toHaveTitle(/.+ · .+ — frostbomb/);

  await expect.poll(() => new URL(page.url()).searchParams.get('seed')).toBeTruthy();
  const seed = new URL(page.url()).searchParams.get('seed')!;
  await expect(page).toHaveTitle(new RegExp(` · ${seed} — frostbomb$`));
});

test('title carries the seed and follows Back history', async ({ page }) => {
  await page.goto('/?seed=frost1');
  await expect(page).toHaveTitle(/ · frost1 — frostbomb$/);

  await page.keyboard.press('r');
  await expect(page).not.toHaveTitle(/frost1/);

  await page.goBack();
  await expect(page).toHaveTitle(/ · frost1 — frostbomb$/);
});

test('seed button has descriptive aria-label', async ({ page }) => {
  const seedBtn = page.locator('#btn-seed');
  const seedDisplay = page.locator('#seed-display');
  const seed = await seedDisplay.textContent();

  if (seed && seed !== '·····') {
    await expect(seedBtn).toHaveAttribute('aria-label', `Copy share link for seed ${seed}`);
  }
});
