import { test, expect } from '@playwright/test';

test('home page exposes canonical Open Graph and Twitter preview metadata', async ({ page }) => {
  await page.goto('/?seed=crystal');

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://frostbomb.com/');
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://frostbomb.com/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://frostbomb.com/og-image.png');
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
});
