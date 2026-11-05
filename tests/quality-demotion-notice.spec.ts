import { test, expect } from "@playwright/test";

const QUALITY_DEMOTION_NOTICE_ID = "quality-demotion-notice";
const QUALITY_DEMOTION_NOTICE_MESSAGE = "Switched to Lite for smoother performance";

const quality = (page: import("@playwright/test").Page) => page.locator("canvas#scene");
const notice = (page: import("@playwright/test").Page) => page.locator(`#${QUALITY_DEMOTION_NOTICE_ID}`);

const SLOW_DELTA = 1 / 30;

async function demoteViaGovernor(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(
    () => typeof (window as unknown as { __FROSTBOMB_TIER_GOVERNOR_TICK__?: unknown }).__FROSTBOMB_TIER_GOVERNOR_TICK__ === "function",
  );
  await page.evaluate((delta) => {
    const tick = (window as unknown as { __FROSTBOMB_TIER_GOVERNOR_TICK__?: (d: number) => void })
      .__FROSTBOMB_TIER_GOVERNOR_TICK__;
    if (!tick) throw new Error("missing __FROSTBOMB_TIER_GOVERNOR_TICK__");
    for (let i = 0; i < 200; i++) tick(delta);
  }, SLOW_DELTA);
}

test("frame-rate demotion shows an accessible notice once, then auto-dismisses", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __FROSTBOMB_QUALITY_DEMOTION_NOTICE_MS__?: number }).__FROSTBOMB_QUALITY_DEMOTION_NOTICE_MS__ = 800;
  });

  await page.goto("/?seed=abcde&quality=rich");
  await expect(quality(page)).toHaveAttribute("data-quality", "rich");

  await demoteViaGovernor(page);
  await expect(quality(page)).toHaveAttribute("data-quality", "lite");

  const banner = notice(page);
  await expect(banner).toHaveAttribute("role", "status");
  await expect(banner).toHaveAttribute("aria-live", "polite");
  await expect(banner).toContainText(QUALITY_DEMOTION_NOTICE_MESSAGE);
  await expect(banner).toBeVisible();

  await page.evaluate((delta) => {
    const tick = (window as unknown as { __FROSTBOMB_TIER_GOVERNOR_TICK__?: (d: number) => void })
      .__FROSTBOMB_TIER_GOVERNOR_TICK__;
    for (let i = 0; i < 200; i++) tick?.(delta);
  }, SLOW_DELTA);
  await expect(banner).toContainText(QUALITY_DEMOTION_NOTICE_MESSAGE);

  await expect(banner).toBeHidden({ timeout: 5000 });
});

test("shows again after Lab promotes back to RICH and governor demotes again", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __FROSTBOMB_QUALITY_DEMOTION_NOTICE_MS__?: number }).__FROSTBOMB_QUALITY_DEMOTION_NOTICE_MS__ = 500;
  });

  await page.goto("/?seed=abcde&quality=rich");
  await demoteViaGovernor(page);
  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toBeHidden({ timeout: 4000 });

  await page.click("#lab-toggle");
  await expect(page.locator("#lab-status")).toHaveText("ON");
  const select = page.locator(".tp-lblv", { hasText: "Quality" }).locator("select");
  await select.selectOption({ label: "RICH" });
  await expect(quality(page)).toHaveAttribute("data-quality", "rich");

  await demoteViaGovernor(page);
  await expect(notice(page)).toContainText(QUALITY_DEMOTION_NOTICE_MESSAGE);
  await expect(notice(page)).toBeVisible();
});
