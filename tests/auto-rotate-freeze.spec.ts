import { test, expect } from "@playwright/test";

type Rot = { x: number; y: number; z: number };

test("pausing auto-rotate freezes the crystal instead of snapping to zero", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "true");
  await page.waitForFunction(() => typeof (window as any).__FROSTBOMB_AUTOROTATE__ === "function");
  const read = () => page.evaluate<Rot>(() => (window as any).__FROSTBOMB_AUTOROTATE__());

  await page.waitForTimeout(1000);
  const before = await read();
  expect(before.z).toBeGreaterThan(0);

  await page.keyboard.press("a");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "false");
  const paused = await read();
  expect(Math.abs(paused.z - before.z)).toBeLessThan(0.05);

  await page.waitForTimeout(500);
  const after = await read();
  expect(Math.abs(after.z - paused.z)).toBeLessThan(0.001);
  expect(Math.abs(after.x - paused.x)).toBeLessThan(0.001);

  await page.keyboard.press("a");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(100);
  const resumed = await read();
  expect(Math.abs(resumed.z - paused.z)).toBeLessThan(0.05);
});
