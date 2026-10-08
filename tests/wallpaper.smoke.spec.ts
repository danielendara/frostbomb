import { expect, test, type Page } from "@playwright/test";

/**
 * #377 — W / Save as wallpaper downloads a screen-sized, opaque PNG and leaves
 * the live renderer exactly as it was. (Vitest has no WebGL, so the
 * restore-equality check against the real scene lives here.)
 */

async function liveCanvasState(page: Page) {
  return page.evaluate(() => {
    const c = document.getElementById("scene") as HTMLCanvasElement;
    return { width: c.width, height: c.height, cssWidth: c.style.width, cssHeight: c.style.height };
  });
}

async function decodePng(page: Page, base64: string) {
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const probe = document.createElement("canvas");
    probe.width = bitmap.width;
    probe.height = bitmap.height;
    const ctx = probe.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const corner = ctx.getImageData(0, 0, 1, 1).data;
    const centre = ctx.getImageData(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1).data;
    return { width: bitmap.width, height: bitmap.height, cornerAlpha: corner[3], centreAlpha: centre[3] };
  }, base64);
}

test("W downloads a screen-sized opaque wallpaper PNG and restores the live canvas", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await expect(page.locator("#seed-display")).toHaveText("abcde");
  await expect(page.locator("#btn-save-wallpaper")).toBeVisible();
  const before = await liveCanvasState(page);

  const downloadPromise = page.waitForEvent("download");
  await page.keyboard.press("w");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^frostbomb-[a-z-]+-abcde-wallpaper\.png$/);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const png = await decodePng(page, Buffer.concat(chunks).toString("base64"));

  // Screen-shaped: the screen in physical pixels (long edge ≤ 4096).
  const expected = await page.evaluate(() => {
    const dpr = Math.min(window.devicePixelRatio, 3);
    const portrait = window.matchMedia("(orientation: portrait)").matches;
    const short = Math.min(screen.width, screen.height) * dpr;
    const long = Math.max(screen.width, screen.height) * dpr;
    return portrait ? { width: Math.round(short), height: Math.round(long) } : { width: Math.round(long), height: Math.round(short) };
  });
  expect(png.width).toBe(expected.width);
  expect(png.height).toBe(expected.height);
  // Opaque: the WebGL canvas clears to alpha 0, so the corner proves the backdrop fill.
  expect(png.cornerAlpha).toBe(255);

  // The live renderer is back exactly where it was (no lasting resize).
  await expect(page.locator("#a11y-announcer")).toContainText("Wallpaper saved", { timeout: 15_000 });
  expect(await liveCanvasState(page)).toEqual(before);
});

test("the Save as wallpaper button works too, and the shortcut is documented", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await expect(page.locator("#seed-display")).toHaveText("abcde");

  const btn = page.locator("#btn-save-wallpaper");
  await expect(btn).toHaveAttribute("aria-keyshortcuts", "w");
  const downloadPromise = page.waitForEvent("download");
  await btn.click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/-wallpaper\.png$/);

  await page.click("#guide-toggle");
  await expect(page.locator("#guide-shortcuts .shortcut-item", { hasText: "wallpaper" })).toBeVisible();
});

test("W still works in Photo Mode, where the action bar is hidden", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await expect(page.locator("#seed-display")).toHaveText("abcde");
  await page.keyboard.press("h");
  const downloadPromise = page.waitForEvent("download");
  await page.keyboard.press("w");
  expect((await downloadPromise).suggestedFilename()).toMatch(/-wallpaper\.png$/);
});
