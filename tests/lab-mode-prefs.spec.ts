import { test, expect } from "@playwright/test";

const MODE_PREFS_KEY = "frostbomb-mode-prefs";

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

test("toggling lab mode writes lab to localStorage (#312)", async ({ page }) => {
  await page.goto("/?seed=abcde");

  await page.click("#lab-toggle");
  await expect(page.locator("#lab-status")).toHaveText("ON");

  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "{}"),
    MODE_PREFS_KEY,
  );
  expect(stored.lab).toBe(true);
});

test("a cold load with no lab query restores the last-remembered lab pref (#312)", async ({
  page,
}) => {
  await page.goto("/?seed=abcde");
  await page.click("#lab-toggle");
  await expect(page.locator("#lab-controls")).toBeVisible();
  await expect(page.locator("#lab-toggle")).toHaveAttribute("aria-pressed", "true");

  await page.goto("/?seed=fghij");
  await expect(page.locator("#lab-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#lab-controls")).toBeVisible();
  await expect(page.locator("#lab-status")).toHaveText("ON");
});

test("lab off is remembered across visits (#312)", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await page.click("#lab-toggle");
  await expect(page.locator("#lab-controls")).toBeVisible();
  await page.click("#lab-toggle");
  await expect(page.locator("#lab-controls")).not.toBeVisible();

  await page.goto("/?seed=fghij");
  await expect(page.locator("#lab-toggle")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#lab-controls")).not.toBeVisible();
});

test("corrupt mode prefs fall back to lab off (#312)", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await page.evaluate((key) => localStorage.setItem(key, "not-json"), MODE_PREFS_KEY);
  await page.goto("/?seed=fghij");
  await expect(page.locator("#lab-toggle")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#lab-controls")).not.toBeVisible();
});

test("share URL never includes lab= (#312)", async ({ page }) => {
  await stubClipboard(page);
  await page.goto("/?seed=abcde");
  await page.click("#lab-toggle");
  await expect(page.locator("#lab-status")).toHaveText("ON");

  await page.click("#btn-copy");
  await expect
    .poll(() => page.evaluate(() => (window as any).__copiedText as string | null))
    .toMatch(/seed=abcde/);

  const copied = (await page.evaluate(() => (window as any).__copiedText)) as string;
  expect(new URL(copied).searchParams.get("lab")).toBeNull();
  expect(new URL(page.url()).searchParams.get("lab")).toBeNull();
});
