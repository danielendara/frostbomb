import { test, expect } from "@playwright/test";
import { stubClipboard } from "./e2e-helpers";

const quality = (page: import("@playwright/test").Page) => page.locator("canvas#scene");

test("?quality=lite and ?quality=rich set canvas[data-quality]", async ({ page }) => {
  await page.goto("/?seed=abcde&quality=lite");
  await expect(quality(page)).toHaveAttribute("data-quality", "lite");

  await page.goto("/?seed=abcde&quality=rich");
  await expect(quality(page)).toHaveAttribute("data-quality", "rich");
});

test("reduced motion forces LITE, even over ?quality=rich", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?seed=abcde&quality=rich");
  await expect(quality(page)).toHaveAttribute("data-quality", "lite");
});

test("ice glints: RICH animates them by view, LITE and reduced motion get the static bake", async ({ page }) => {
  await page.goto("/?seed=abcde&quality=rich");
  await expect(quality(page)).toHaveAttribute("data-glint", "view");

  await page.goto("/?seed=abcde&quality=lite");
  await expect(quality(page)).toHaveAttribute("data-glint", "static");

  // Reduced motion forces LITE, so it freezes on the static bake even over ?quality=rich.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?seed=abcde&quality=rich");
  await expect(quality(page)).toHaveAttribute("data-quality", "lite");
  await expect(quality(page)).toHaveAttribute("data-glint", "static");
});

test("Lab Mode switching RICH to LITE swaps the glint to the static bake", async ({ page }) => {
  await page.goto("/?seed=abcde&quality=rich");
  await expect(quality(page)).toHaveAttribute("data-glint", "view");

  await page.click("#lab-toggle");
  await expect(page.locator("#lab-status")).toHaveText("ON");
  const select = page.locator(".tp-lblv", { hasText: "Quality" }).locator("select");
  await select.selectOption({ label: "LITE" });
  await expect(quality(page)).toHaveAttribute("data-quality", "lite");
  await expect(quality(page)).toHaveAttribute("data-glint", "static");

  await select.selectOption({ label: "RICH" });
  await expect(quality(page)).toHaveAttribute("data-glint", "view");
});

test("a copied share link never contains quality", async ({ page }) => {
  await stubClipboard(page);
  await page.goto("/?seed=abcde&quality=lite");
  await expect(quality(page)).toHaveAttribute("data-quality", "lite");

  await page.click("#btn-copy");
  await expect
    .poll(() => page.evaluate(() => (window as any).__copiedText as string | null))
    .toMatch(/seed=abcde/);

  const copied = (await page.evaluate(() => (window as any).__copiedText)) as string;
  expect(new URL(copied).searchParams.has("quality")).toBe(false);
  expect(copied).not.toContain("quality");
});

test("LITE never fetches the postprocessing chunk; RICH does", async ({ page }) => {
  // Dev serves the library from node_modules/.vite/deps; the app's own postprocessing.ts is not the chunk.
  const fetched: string[] = [];
  page.on("request", (req) => {
    if (/node_modules\/.*postprocessing/i.test(req.url())) fetched.push(req.url());
  });

  await page.goto("/?seed=abcde&quality=lite");
  await expect(page.locator("canvas#scene[data-entry-active='false']")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(fetched).toEqual([]);

  await page.goto("/?seed=abcde&quality=rich");
  await expect.poll(() => fetched.length, { timeout: 15_000 }).toBeGreaterThan(0);
});

test("Lab Mode quality toggle switches the tier without touching the URL", async ({ page }) => {
  await page.goto("/?seed=abcde&quality=rich");
  await expect(quality(page)).toHaveAttribute("data-quality", "rich");

  await page.click("#lab-toggle");
  await expect(page.locator("#lab-status")).toHaveText("ON");
  const select = page.locator(".tp-lblv", { hasText: "Quality" }).locator("select");
  await expect(select).toHaveValue("RICH");

  await select.selectOption({ label: "LITE" });
  await expect(quality(page)).toHaveAttribute("data-quality", "lite");
  expect(new URL(page.url()).searchParams.get("quality")).toBe("rich");
  expect(new URL(page.url()).searchParams.get("seed")).toBe("abcde");
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

test("frame-rate demotion updates the Lab Quality menu to LITE while it is open", async ({ page }) => {
  await page.goto("/?seed=abcde&quality=rich");
  await page.click("#lab-toggle");
  await expect(page.locator("#lab-status")).toHaveText("ON");
  const select = page.locator(".tp-lblv", { hasText: "Quality" }).locator("select");
  await expect(select).toHaveValue("RICH");

  await demoteViaGovernor(page);
  await expect(quality(page)).toHaveAttribute("data-quality", "lite");
  await expect(select).toHaveValue("LITE");
});
