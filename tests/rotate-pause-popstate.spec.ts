import { test, expect } from "@playwright/test";

/**
 * Held-export popstate must compare rotate against the rotate *preference*,
 * not the live scene flag.
 *
 * Save 3D / share pause `scene.isAutoRotateEnabled` while the export is held,
 * but share URLs (and `writeCurrentModeParams`) encode `rotatePref`. A popstate
 * to the same crystal URL during that window must not regrow; a popstate that
 * really flips rotate must still apply.
 */

test("held 3D export: same-crystal popstate does not regrow, rotate change still applies", async ({
  page,
}) => {
  test.setTimeout(120_000);

  let releaseExport!: () => void;
  const exportGate = new Promise<void>((resolve) => {
    releaseExport = resolve;
  });
  let markRequested!: () => void;
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve;
  });
  await page.route(/mesh-export\.ts/, async (route) => {
    markRequested();
    await exportGate;
    await route.continue();
  });

  await page.goto("/?seed=abcde&rotate=1");
  await expect(page.locator("#seed-display")).toHaveText("abcde");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "true");

  // Hold the export: the app pauses scene auto-rotate until the gated module loads.
  await page.locator("#btn-save-3d").click();
  await requested;

  // Fresh announcer spy: only popstate-driven "Loaded seed" lines count.
  await page.locator("#a11y-announcer").evaluate((el) => {
    const heard: string[] = [];
    (window as unknown as { __heard: string[] }).__heard = heard;
    new MutationObserver(() => {
      if (el.textContent) heard.push(el.textContent);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
  const loadedSeedCount = () =>
    page.evaluate(
      () =>
        ((window as unknown as { __heard?: string[] }).__heard ?? []).filter((m) =>
          /Loaded seed/.test(m),
        ).length,
    );

  // Same crystal as on screen (the ignored `x` param only changes the string
  // so the popstate handler reaches the semantic compare).
  await page.evaluate(() => {
    history.pushState(null, "", "/?seed=abcde&rotate=1&x=1");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForTimeout(500);
  expect(await loadedSeedCount()).toBe(0);
  await expect(page.locator("#seed-display")).toHaveText("abcde");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "true");

  // A genuine rotate flip on the same seed must still apply (regrow + rotate off).
  await page.evaluate(() => {
    history.pushState(null, "", "/?seed=abcde&rotate=0");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.locator("#a11y-announcer")).toContainText("Loaded seed abcde", {
    timeout: 10_000,
  });
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "false");

  const download = page.waitForEvent("download", { timeout: 60_000 });
  releaseExport();
  await download;
  await expect(page.locator("#btn-save-3d")).not.toHaveAttribute("aria-busy", "true", {
    timeout: 30_000,
  });
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "false");
  await page.unroute(/mesh-export\.ts/);
});

test("held 3D export: pressing A during export leaves rotate off after resume", async ({
  page,
}) => {
  test.setTimeout(120_000);

  let releaseExport!: () => void;
  const exportGate = new Promise<void>((resolve) => {
    releaseExport = resolve;
  });
  let markRequested!: () => void;
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve;
  });
  await page.route(/mesh-export\.ts/, async (route) => {
    markRequested();
    await exportGate;
    await route.continue();
  });

  await page.goto("/?seed=abcde&rotate=1");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "true");

  await page.locator("#btn-save-3d").click();
  await requested;

  await page.keyboard.press("a");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "false");

  const download = page.waitForEvent("download", { timeout: 60_000 });
  releaseExport();
  await download;
  await expect(page.locator("#btn-save-3d")).not.toHaveAttribute("aria-busy", "true", {
    timeout: 30_000,
  });
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "false");
  await page.unroute(/mesh-export\.ts/);
});
