import { expect, test } from '@playwright/test';

test('records first-render performance marks', async ({ page }) => {
  await page.goto('/');

  await expect.poll(async () => page.evaluate(() => ({
    sceneCreate: performance.getEntriesByName('frostbomb:scene-create').length,
    firstFlake: performance.getEntriesByName('frostbomb:first-flake-built').length,
    firstFrame: performance.getEntriesByName('frostbomb:first-frame-rendered').length,
  }))).toEqual({
    sceneCreate: 1,
    firstFlake: 1,
    firstFrame: 1,
  });
});
