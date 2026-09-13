import { test, expect } from "@playwright/test";

// Captures whatever copyLink() writes to the clipboard without depending on
// real browser clipboard permissions (which are flaky in CI). Must be
// installed before the app script runs, so it's an init script rather than
// a post-load page.evaluate().
async function stubClipboard(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    (window as any).__copiedText = null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          (window as any).__copiedText = text;
          return Promise.resolve();
        },
      },
    });
  });
}

test("bare ?seed= link is unchanged: both modes default off", async ({ page }) => {
  await page.goto("/?seed=abcde");

  const seedDisplay = page.locator("#seed-display");
  await expect(seedDisplay).toHaveText("abcde");

  await expect(page.locator("body")).not.toHaveClass(/pink-mode/);
  await expect(page.locator("body")).not.toHaveClass(/prism-mode/);
  await expect(page.locator("#btn-pink")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#btn-prism")).toHaveAttribute("aria-pressed", "false");

  // No stray pink/prism params should have been introduced.
  expect(new URL(page.url()).search).toBe("?seed=abcde");
});

test("?seed=X&pink=1&prism=1 opens with both modes on", async ({ page }) => {
  await page.goto("/?seed=abcde&pink=1&prism=1");

  const seedDisplay = page.locator("#seed-display");
  await expect(seedDisplay).toHaveText("abcde");

  await expect(page.locator("body")).toHaveClass(/pink-mode/);
  await expect(page.locator("body")).toHaveClass(/prism-mode/);
  await expect(page.locator("#btn-pink")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#btn-prism")).toHaveAttribute("aria-pressed", "true");
});

test("copying the link while pink/prism are on includes both flags", async ({ page }) => {
  await stubClipboard(page);
  await page.goto("/?seed=abcde&pink=1&prism=1");

  await expect(page.locator("#btn-pink")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#btn-prism")).toHaveAttribute("aria-pressed", "true");

  await page.click("#btn-copy");

  await expect
    .poll(() => page.evaluate(() => (window as any).__copiedText as string | null))
    .toMatch(/seed=abcde/);

  const copied = (await page.evaluate(() => (window as any).__copiedText)) as string;
  const copiedUrl = new URL(copied);
  expect(copiedUrl.searchParams.get("seed")).toBe("abcde");
  expect(copiedUrl.searchParams.get("pink")).toBe("1");
  expect(copiedUrl.searchParams.get("prism")).toBe("1");
});

test("toggling pink/prism after boot keeps the URL an accurate snapshot", async ({ page }) => {
  await page.goto("/?seed=abcde");

  await page.click("#btn-pink");
  await expect(page).toHaveURL(/[?&]pink=1/);
  expect(new URL(page.url()).searchParams.get("prism")).toBeNull();

  await page.click("#btn-prism");
  await expect(page).toHaveURL(/[?&]prism=1/);

  // Turning pink back off should drop it from the URL rather than write pink=0.
  await page.click("#btn-pink");
  await expect.poll(() => new URL(page.url()).searchParams.get("pink")).toBeNull();
  expect(new URL(page.url()).searchParams.get("prism")).toBe("1");
  expect(new URL(page.url()).searchParams.get("seed")).toBe("abcde");
});
