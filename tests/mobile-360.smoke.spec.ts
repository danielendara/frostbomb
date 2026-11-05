import { test, expect, type Locator } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.use({ viewport: { width: 360, height: 640 } });

type Box = { x: number; y: number; width: number; height: number };

function asRect(box: Box) {
  return {
    left: box.x,
    top: box.y,
    right: box.x + box.width,
    bottom: box.y + box.height,
  };
}

function overlaps(a: Box, b: Box, slack = 1): boolean {
  const ar = asRect(a);
  const br = asRect(b);
  return (
    ar.left + slack < br.right &&
    br.left + slack < ar.right &&
    ar.top + slack < br.bottom &&
    br.top + slack < ar.bottom
  );
}

function inViewport(box: Box, width = 360, height = 640, slack = 1): boolean {
  return (
    box.x >= -slack &&
    box.y >= -slack &&
    box.x + box.width <= width + slack &&
    box.y + box.height <= height + slack
  );
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, `expected ${String(locator)} to have a bounding box`).not.toBeNull();
  return box!;
}

test("360×640 keeps masthead, field notes, and actions from overlapping", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    document.getAnimations().forEach((animation) => {
      const effect = animation.effect;
      if (effect && "getTiming" in effect) {
        const timing = (effect as KeyframeEffect).getTiming();
        if (timing.iterations === Infinity) return;
      }
      try {
        animation.finish();
      } catch {
        animation.cancel();
      }
    });
  });

  const masthead = await boxOf(page.locator(".masthead"));
  const notes = await boxOf(page.locator(".field-notes"));
  const actions = await boxOf(page.locator(".actions"));
  const refresh = await boxOf(page.locator("#refresh"));
  const photoMode = await boxOf(page.locator("#btn-ui"));
  const savePng = await boxOf(page.locator("#btn-save"));

  expect(overlaps(masthead, notes)).toBe(false);
  expect(overlaps(masthead, actions)).toBe(false);
  expect(overlaps(notes, actions)).toBe(false);

  expect(inViewport(refresh)).toBe(true);
  expect(inViewport(photoMode)).toBe(true);
  expect(inViewport(savePng)).toBe(true);

  // Primary actions (Grow / Photo Mode / Save) keep >=44px tap targets even
  // as secondary controls (e.g. Reset) densify more aggressively.
  for (const primary of [refresh, photoMode, savePng]) {
    expect(primary.height).toBeGreaterThanOrEqual(44);
  }

  // No horizontal scroll/overflow on the chrome at this width.
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  const clientWidth = await page.evaluate(
    () => document.documentElement.clientWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  for (const box of [notes, actions]) {
    expect(box.x + box.width).toBeLessThanOrEqual(clientWidth + 1);
  }

  await expect(page.locator("#refresh")).toBeVisible();
  await expect(page.locator("#btn-ui")).toBeEnabled();
  await expect(page.locator("#btn-save")).toBeEnabled();
  await page.locator("#refresh").click();
  await expect(page.locator("#seed-display")).not.toHaveText("·····");
});

const SLOW_DELTA = 1 / 30;

async function demoteViaGovernor(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { __FROSTBOMB_TIER_GOVERNOR_TICK__?: unknown })
        .__FROSTBOMB_TIER_GOVERNOR_TICK__ === "function",
  );
  await page.evaluate((delta) => {
    const tick = (window as unknown as { __FROSTBOMB_TIER_GOVERNOR_TICK__?: (d: number) => void })
      .__FROSTBOMB_TIER_GOVERNOR_TICK__;
    if (!tick) throw new Error("missing __FROSTBOMB_TIER_GOVERNOR_TICK__");
    for (let i = 0; i < 200; i++) tick(delta);
  }, SLOW_DELTA);
}

async function finishEntryAnimations(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    document.getAnimations().forEach((animation) => {
      const effect = animation.effect;
      if (effect && "getTiming" in effect) {
        const timing = (effect as KeyframeEffect).getTiming();
        if (timing.iterations === Infinity) return;
      }
      try {
        animation.finish();
      } catch {
        animation.cancel();
      }
    });
  });
}

async function assertNoticeDoesNotOverlapVisibleButtons(
  page: import("@playwright/test").Page,
  width: number,
  height: number,
): Promise<void> {
  const noticeBox = await boxOf(page.locator("#quality-demotion-notice"));
  expect(inViewport(noticeBox, width, height)).toBe(true);

  const buttons = page.locator("button:visible");
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const buttonBox = await buttons.nth(i).boundingBox();
    if (!buttonBox) continue;
    expect(
      overlaps(noticeBox, buttonBox),
      `notice overlapped visible button index ${i}`,
    ).toBe(false);
  }
}

for (const viewport of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
] as const) {
  test(`${viewport.width}×${viewport.height} quality demotion notice does not cover visible buttons`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      (window as unknown as { __FROSTBOMB_QUALITY_DEMOTION_NOTICE_MS__?: number }).__FROSTBOMB_QUALITY_DEMOTION_NOTICE_MS__ =
        120_000;
    });
    await page.goto("/?seed=abcde&quality=rich");
    await finishEntryAnimations(page);
    await demoteViaGovernor(page);
    await expect(page.locator("#quality-demotion-notice")).toBeVisible();
    await assertNoticeDoesNotOverlapVisibleButtons(page, viewport.width, viewport.height);
  });
}
