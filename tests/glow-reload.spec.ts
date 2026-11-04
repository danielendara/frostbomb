import { test, expect } from "@playwright/test";
import { stubClipboard } from "./e2e-helpers";

async function openLab(page: import("@playwright/test").Page) {
  const status = page.locator("#lab-status");
  if ((await status.textContent()) !== "ON") {
    await page.keyboard.press("l");
    await expect(status).toHaveText("ON", { timeout: 15000 });
  }
}

async function expectGlowChecked(page: import("@playwright/test").Page, checked: boolean) {
  await openLab(page);
  const glow = page.locator('.tp-lblv:has-text("Glow") input');
  await expect.poll(async () => glow.isChecked(), { timeout: 15_000 }).toBe(checked);
}

test("Glow preference survives reload, links override without clobbering storage", async ({
  page,
  context,
}) => {
  await stubClipboard(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("frostbomb-mode-prefs"));
  await page.goto("/?glow=0");
  await page.keyboard.press("o");
  await expectGlowChecked(page, true);
  await page.reload();
  await expectGlowChecked(page, true);

  await page.goto("/?seed=abcde&glow=0");
  await expectGlowChecked(page, false);

  await page.goto("/?seed=fghij");
  await expectGlowChecked(page, false);

  await page.goto("/");
  await expectGlowChecked(page, true);

  await page.keyboard.press("p");
  await page.keyboard.press("m");
  await page.click("#btn-copy");
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __copiedText: string | null }).__copiedText))
    .not.toBeNull();
  const copied = (await page.evaluate(
    () => (window as unknown as { __copiedText: string | null }).__copiedText,
  )) as string;
  const link = new URL(copied, page.url());
  expect(link.searchParams.get("glow")).toBe("1");
  expect(link.searchParams.get("pink")).toBe("1");
  expect(link.searchParams.get("prism")).toBe("1");

  const fresh = await context.newPage();
  await fresh.goto(link.pathname + link.search);
  await openLab(fresh);
  await expect.poll(async () => fresh.locator('.tp-lblv:has-text("Glow") input').isChecked(), {
    timeout: 15_000,
  }).toBe(true);
  await expect(fresh.locator("body")).toHaveClass(/pink-mode/);
  await expect(fresh.locator("body")).toHaveClass(/prism-mode/);
  await fresh.close();
});
