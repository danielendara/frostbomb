import { test, expect } from "@playwright/test";
import { stubClipboard } from "./e2e-helpers";

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

test("a cold load with no pink/prism query restores the last-remembered prefs", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await page.click("#btn-pink");
  await expect(page.locator("#btn-pink")).toHaveAttribute("aria-pressed", "true");

  // Fresh navigation, same origin/localStorage, no pink= in the query this time.
  await page.goto("/?seed=fghij");

  await expect(page.locator("#btn-pink")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("body")).toHaveClass(/pink-mode/);
  await expect(page.locator("#btn-prism")).toHaveAttribute("aria-pressed", "false");
});

test("an explicit query still overrides remembered prefs", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await page.click("#btn-pink");
  await expect(page.locator("#btn-pink")).toHaveAttribute("aria-pressed", "true");

  // Remembered pink=true, but this load's URL has no pink= at all for prism,
  // and explicitly omits pink — a real ?pink= absence still means "use
  // storage" (covered above); this checks the opposite: an explicit,
  // recognized param always wins over whatever is stored.
  await page.goto("/?seed=fghij&pink=0");

  await expect(page.locator("#btn-pink")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("body")).not.toHaveClass(/pink-mode/);
});

test("?rotate=1 enables auto-rotate; ?rotate=0 disables it", async ({ page }) => {
  await page.goto("/?seed=abcde&rotate=1");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "true");

  await page.goto("/?seed=abcde&rotate=0");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "false");
});

test("copying the link includes rotate=1 when on and rotate=0 when explicitly off", async ({
  page,
}) => {
  await stubClipboard(page);
  await page.goto("/?seed=abcde&rotate=1");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "true");

  await page.click("#btn-copy");
  await expect
    .poll(() => page.evaluate(() => (window as any).__copiedText as string | null))
    .not.toBeNull();
  let copied = (await page.evaluate(() => (window as any).__copiedText)) as string;
  expect(new URL(copied).searchParams.get("rotate")).toBe("1");

  await page.goto("/?seed=abcde");
  await page.click("#btn-rotate");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "false");

  await page.click("#btn-copy");
  await expect
    .poll(() => page.evaluate(() => (window as any).__copiedText as string | null))
    .not.toBeNull();
  copied = (await page.evaluate(() => (window as any).__copiedText)) as string;
  expect(new URL(copied).searchParams.get("rotate")).toBe("0");
});

test("a cold load with no rotate query restores the last-remembered pref", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await page.click("#btn-rotate");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "false");

  await page.goto("/?seed=fghij");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "false");
});

test("an explicit rotate query overrides remembered pref", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await page.click("#btn-rotate");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "false");

  await page.goto("/?seed=fghij&rotate=1");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "true");
});

test("prefers-reduced-motion keeps auto-rotate off even with ?rotate=1", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?seed=abcde&rotate=1");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#btn-rotate")).toBeDisabled();
});

test("?lab=1 enables lab mode; ?lab=0 disables it", async ({ page }) => {
  await page.goto("/?seed=abcde&lab=1");
  await expect(page.locator("#lab-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#lab-controls")).toBeVisible();

  await page.goto("/?seed=abcde&lab=0");
  await expect(page.locator("#lab-toggle")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#lab-controls")).not.toBeVisible();
});

test("copying the link includes lab=1 when on and lab=0 when explicitly off", async ({
  page,
}) => {
  await stubClipboard(page);
  await page.goto("/?seed=abcde&lab=1");
  await expect(page.locator("#lab-toggle")).toHaveAttribute("aria-pressed", "true");

  await page.click("#btn-copy");
  await expect
    .poll(() => page.evaluate(() => (window as any).__copiedText as string | null))
    .not.toBeNull();
  let copied = (await page.evaluate(() => (window as any).__copiedText)) as string;
  expect(new URL(copied).searchParams.get("lab")).toBe("1");

  await page.goto("/?seed=abcde");
  await expect(page.locator("#lab-toggle")).toHaveAttribute("aria-pressed", "true");
  await page.click("#lab-toggle");
  await expect(page.locator("#lab-toggle")).toHaveAttribute("aria-pressed", "false");

  await page.click("#btn-copy");
  await expect
    .poll(() => page.evaluate(() => (window as any).__copiedText as string | null))
    .not.toBeNull();
  copied = (await page.evaluate(() => (window as any).__copiedText)) as string;
  expect(new URL(copied).searchParams.get("lab")).toBe("0");
});

test("a cold load with no lab query restores the last-remembered lab pref", async ({
  page,
}) => {
  await page.goto("/?seed=abcde");
  await page.click("#lab-toggle");
  await expect(page.locator("#lab-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#lab-status")).toHaveText("ON");

  await page.goto("/?seed=fghij");
  await expect(page.locator("#lab-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#lab-controls")).toBeVisible();
});

test("toggling rotate writes explicit rotate=1 / rotate=0", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await page.click("#btn-rotate");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => new URL(page.url()).searchParams.get("rotate")).toBe("0");

  await page.click("#btn-rotate");
  await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => new URL(page.url()).searchParams.get("rotate")).toBe("1");
});

test("grow-another keeps pink/prism and rewrites seed", async ({ page }) => {
  await page.goto("/?seed=abcde&pink=1");
  await expect(page.locator("#btn-pink")).toHaveAttribute("aria-pressed", "true");

  await page.click("#refresh");
  await expect.poll(() => new URL(page.url()).searchParams.get("pink")).toBe("1");
  expect(new URL(page.url()).searchParams.get("seed")).toBeTruthy();
  expect(new URL(page.url()).searchParams.get("seed")).not.toBe("abcde");
  expect(page.url()).not.toMatch(/\/$/);
});
