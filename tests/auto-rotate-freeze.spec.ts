import { test, expect } from "@playwright/test";

// Upper bound on how fast the auto-rotate roll can move, in rad per second of
// frame time: autoTime advances by (rAF frame delta) x particles.timeStep (0.3
// without reduced motion), and z = 0.08t + 0.04 sin(0.3t) has |dz/dt| <= 0.092.
// So |dz| <= 0.3 x 0.092 = 0.0276 rad per second of frame time, however slow
// the frames are. A 10% margin covers float noise.
const MAX_Z_RATE = 0.3 * (0.08 + 0.04 * 0.3) * 1.1;

type Sample = { z: number; frameTs: number };

test("pausing auto-rotate freezes the crystal instead of snapping to zero", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "true");
  await page.waitForFunction(() => typeof (window as any).__FROSTBOMB_AUTOROTATE__ === "function");

  // Record every rAF timestamp: the scene's timer uses the same timestamps,
  // so frame time between two samples bounds how far autoTime could advance.
  await page.evaluate(() => {
    const w = window as any;
    w.__lastFrameTs = 0;
    const tick = (ts: number) => {
      w.__lastFrameTs = ts;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // Let it spin far enough that a snap back to 0 is unmistakable.
  await page.waitForFunction(() => (window as any).__FROSTBOMB_AUTOROTATE__().z > 0.02);

  // Pause with A. Sample and toggle in the same task, so no frame runs between
  // them: a frozen crystal keeps exactly the last applied angle.
  const [before, paused] = await page.evaluate(async () => {
    const w = window as any;
    const sample = () => ({ z: w.__FROSTBOMB_AUTOROTATE__().z, frameTs: w.__lastFrameTs });
    const b = sample();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return [b, sample()] as [Sample, Sample];
  });
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "false");
  // Tight: no snap to zero and no drift across the pause frame.
  expect(Math.abs(paused.z - before.z)).toBeLessThan(1e-6);
  expect(paused.z).toBeGreaterThan(0.02);

  // Still frozen 500 ms later.
  await page.waitForTimeout(500);
  const held = await page.evaluate(() => (window as any).__FROSTBOMB_AUTOROTATE__().z as number);
  expect(Math.abs(held - paused.z)).toBeLessThan(1e-6);

  // Resume with A and let a few frames run. Continuity: the roll carries on
  // forward from the held angle, by no more than the frame time that actually
  // elapsed allows. That holds on a slow runner, but a jump to the global clock
  // angle (the old behaviour) would exceed it.
  const [resumeFrom, resumed] = await page.evaluate(async () => {
    const w = window as any;
    const sample = () => ({ z: w.__FROSTBOMB_AUTOROTATE__().z, frameTs: w.__lastFrameTs });
    const from = sample();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    const start = performance.now();
    await new Promise<void>((resolve) => {
      let frames = 0;
      const step = () => {
        if (++frames >= 4 && performance.now() - start >= 100) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    return [from, sample()] as [Sample, Sample];
  });
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "true");
  const frameSeconds = (resumed.frameTs - resumeFrom.frameTs) / 1000;
  const drift = resumed.z - resumeFrom.z;
  expect(drift).toBeGreaterThan(0);
  expect(drift).toBeLessThanOrEqual(MAX_Z_RATE * frameSeconds + 1e-6);
});
