import { test, expect, type Page } from "@playwright/test";

// `vite dev` serves no hashed chunks, so a real stale-chunk failure only exists
// in a production build. Vite's preload wrapper reports that failure as a
// cancelable `vite:preloadError` on window; dispatching it directly exercises
// the app's recovery wiring (guard, URL sync, reload) against the dev server.

/** Resolves to `true` when nobody prevented the event (the error would surface). */
function dispatchPreloadError(page: Page): Promise<boolean> {
  return page.evaluate(() => window.dispatchEvent(new Event("vite:preloadError", { cancelable: true })));
}

// A reload is a new document: count `load` events (replaceState is not one).
function countLoads(page: Page): () => number {
  let loads = 0;
  page.on("load", () => {
    loads += 1;
  });
  return () => loads;
}

test("a vite:preloadError reloads once, keeps the crystal and look, and a second one does not", async ({
  page,
}) => {
  const loads = countLoads(page);
  await page.goto("/?seed=abcde&pink=1");
  await expect(page.locator("#seed-display")).toHaveText("abcde");
  await expect(page.locator("body")).toHaveClass(/pink-mode/);
  expect(loads()).toBe(1);

  await page.evaluate(() => {
    (window as unknown as { __beforeReload: boolean }).__beforeReload = true;
    window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
  });

  await expect.poll(loads).toBe(2);
  await expect(page.locator("#seed-display")).toHaveText("abcde");
  await expect(page.locator("body")).toHaveClass(/pink-mode/);
  const url = new URL(page.url());
  expect(url.searchParams.get("seed")).toBe("abcde");
  expect(url.searchParams.get("pink")).toBe("1");
  // A new document: the marker set on the old one is gone.
  expect(
    await page.evaluate(() => (window as unknown as { __beforeReload?: boolean }).__beforeReload),
  ).toBeUndefined();

  // Inside the guard window: not prevented (the original error surfaces) and no reload.
  expect(await dispatchPreloadError(page)).toBe(true);
  await page.waitForTimeout(750);
  expect(loads()).toBe(2);
  await expect(page.locator("#seed-display")).toHaveText("abcde");
});

test("a reload from a bare URL comes back with the same crystal", async ({ page }) => {
  const loads = countLoads(page);
  await page.goto("/");
  await expect(page.locator("#seed-display")).toHaveText(/^[a-z0-9]{3,12}$/i);
  const seed = (await page.locator("#seed-display").textContent()) ?? "";
  expect(new URL(page.url()).searchParams.get("seed")).toBeNull();

  await page.evaluate(() => {
    window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
  });

  await expect.poll(loads).toBe(2);
  await expect(page.locator("#seed-display")).toHaveText(seed);
  expect(new URL(page.url()).searchParams.get("seed")).toBe(seed);
});

test("with sessionStorage blocked a vite:preloadError never reloads", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
  });
  const loads = countLoads(page);
  await page.goto("/?seed=abcde");
  await expect(page.locator("#seed-display")).toHaveText("abcde");

  expect(await dispatchPreloadError(page)).toBe(true);
  await page.waitForTimeout(750);
  expect(loads()).toBe(1);
});
