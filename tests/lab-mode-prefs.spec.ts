import { test, expect } from "@playwright/test";
import { stubClipboard } from "./e2e-helpers";

const MODE_PREFS_KEY = "frostbomb-mode-prefs";

test("toggling lab mode writes lab to localStorage (#312)", async ({ page }) => {
  await page.goto("/?seed=abcde");

  await page.click("#lab-toggle");
  await expect(page.locator("#lab-status")).toHaveText("ON");

  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "{}"),
    MODE_PREFS_KEY,
  );
  expect(stored.lab).toBe(true);

  // Leave lab off so the restore test below starts from a clean toggle.
  await page.click("#lab-toggle");
  await expect(page.locator("#lab-toggle")).toHaveAttribute("aria-pressed", "false");
});

test("a cold load with no lab query restores the last-remembered lab pref (#312)", async ({
  page,
}) => {
  await page.goto("/?seed=abcde");
  await page.click("#lab-toggle");
  await expect(page.locator("#lab-controls")).toBeVisible();
  await expect(page.locator("#lab-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#lab-status")).toHaveText("ON");

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

test("an explicit ?lab= query overrides remembered lab pref (#314)", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await page.click("#lab-toggle");
  await expect(page.locator("#lab-toggle")).toHaveAttribute("aria-pressed", "true");

  await page.goto("/?seed=fghij&lab=0");
  await expect(page.locator("#lab-toggle")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#lab-controls")).not.toBeVisible();
});

test("toggling lab writes explicit lab=1 / lab=0 on the share URL (#317)", async ({ page }) => {
  await stubClipboard(page);
  await page.goto("/?seed=abcde");

  await page.click("#lab-toggle");
  await expect(page.locator("#lab-status")).toHaveText("ON");
  await expect.poll(() => new URL(page.url()).searchParams.get("lab")).toBe("1");

  await page.click("#btn-copy");
  const copiedOn = new URL((await page.evaluate(() => (window as any).__copiedText as string)));
  const liveOn = new URL(page.url());
  expect(copiedOn.searchParams.get("lab")).toBe("1");
  expect(copiedOn.searchParams.get("seed")).toBe(liveOn.searchParams.get("seed"));
  expect(copiedOn.searchParams.get("lab")).toBe(liveOn.searchParams.get("lab"));

  await page.click("#lab-toggle");
  await expect(page.locator("#lab-toggle")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => new URL(page.url()).searchParams.get("lab")).toBe("0");
});
