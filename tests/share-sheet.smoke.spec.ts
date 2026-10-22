import { expect, test } from "@playwright/test";
import { waitForFrostbombReady } from "./e2e-helpers";

/**
 * Share button: image + link through the Web Share sheet. Default Desktop Chrome
 * has no navigator.share, so the button stays hidden; a stubbed navigator proves
 * the supported path. (Vitest runs with environment "node", so DOM visibility has
 * to live here.)
 */

test("Share is hidden where the browser cannot share files", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await expect(page.locator("#seed-display")).toHaveText("abcde");
  await expect(page.locator("#btn-share")).toBeHidden();
  await expect(page.locator("#btn-copy")).toBeVisible();
});

async function stubShare(page: import("@playwright/test").Page, behaviour: "resolve" | "abort" | "notallowed") {
  await page.addInitScript((mode) => {
    const w = window as unknown as { __shareCalls: unknown[] };
    w.__shareCalls = [];
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        // Decode the shared PNG and sample its corner: the WebGL canvas clears to
        // alpha 0, so an opaque corner proves the dark fill was applied.
        const bitmap = await createImageBitmap(data.files![0]);
        const probe = document.createElement("canvas");
        probe.width = bitmap.width;
        probe.height = bitmap.height;
        const pctx = probe.getContext("2d")!;
        pctx.drawImage(bitmap, 0, 0);
        const cornerAlpha = pctx.getImageData(0, 0, 1, 1).data[3];
        w.__shareCalls.push({
          cornerAlpha,
          files: (data.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })),
          title: data.title,
          text: data.text,
          url: data.url,
        });
        if (mode === "abort") throw new DOMException("dismissed", "AbortError");
        if (mode === "notallowed") throw new DOMException("no activation", "NotAllowedError");
      },
    });
    const copied: string[] = [];
    (window as unknown as { __copied: string[] }).__copied = copied;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (t: string) => (copied.push(t), Promise.resolve()) },
    });
  }, behaviour);
}

test("Share appears with a file-capable navigator and shares one PNG plus the link", async ({ page }) => {
  await stubShare(page, "resolve");
  await page.goto("/?seed=abcde");
  await waitForFrostbombReady(page);
  await expect(page.locator("#seed-display")).toHaveText("abcde");
  const share = page.locator("#btn-share");
  await expect(share).toBeVisible();

  await share.click();
  await expect(page.locator("#a11y-announcer")).toContainText("Shared snowflake", { timeout: 15_000 });

  const calls = await page.evaluate(() => (window as unknown as { __shareCalls: any[] }).__shareCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0].files).toHaveLength(1);
  expect(calls[0].files[0].type).toBe("image/png");
  expect(calls[0].files[0].name).toMatch(/^frostbomb-[a-z-]+-abcde\.png$/);
  expect(calls[0].files[0].size).toBeGreaterThan(0);
  expect(calls[0].cornerAlpha).toBe(255);
  expect(calls[0].url).toContain("seed=abcde");

  // Same URL Copy link would write.
  await page.locator("#btn-copy").click();
  const copied = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
  expect(copied.at(-1)).toBe(calls[0].url);
});

test("cancelling the share sheet is silent", async ({ page }) => {
  await stubShare(page, "abort");
  await page.goto("/?seed=abcde");
  await waitForFrostbombReady(page);
  const share = page.locator("#btn-share");
  await expect(share).toBeVisible();
  await share.click();
  await expect(share).toBeEnabled({ timeout: 15_000 });
  const text = await page.locator("#a11y-announcer").innerText();
  expect(text).not.toMatch(/Failed|Link copied|Couldn't/i);
  const copied = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
  expect(copied).toHaveLength(0);
});

test("a non-abort failure falls back to Copy link and keeps Copy link visible", async ({ page }) => {
  await stubShare(page, "notallowed");
  await page.goto("/?seed=abcde");
  await waitForFrostbombReady(page);
  await expect(page.locator("#btn-share")).toBeVisible();
  await page.locator("#btn-share").click();
  await expect(page.locator("#a11y-announcer")).toContainText("Link copied", { timeout: 15_000 });
  const copied = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
  expect(copied).toHaveLength(1);
  await expect(page.locator("#btn-copy")).toBeVisible();
});
