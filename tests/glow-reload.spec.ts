import { test, expect } from "@playwright/test";
import { stubClipboard, waitForGlowCheckbox } from "./e2e-helpers";

async function openLab(page: import("@playwright/test").Page) {
  await expect(page.locator("#scene")).toHaveAttribute("data-entry-active", "false", {
    timeout: 30_000,
  });
  const status = page.locator("#lab-status");
  if ((await status.textContent()) !== "ON") {
    await page.keyboard.press("l");
    await expect(status).toHaveText("ON", { timeout: 30_000 });
  }
}

async function expectGlowChecked(page: import("@playwright/test").Page, checked: boolean) {
  await openLab(page);
  const glow = await waitForGlowCheckbox(page);
  await expect.poll(async () => glow.isChecked(), { timeout: 15_000 }).toBe(checked);
}

test("Glow preference survives reload, links override without clobbering storage", async ({
  page,
  context,
}) => {
  test.slow();
  await stubClipboard(page);
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
    .poll(() => page.evaluate(() => (window as unknown as { __copiedText: string | null }).__copiedText), {
      timeout: 15_000,
    })
    .not.toBeNull();
  const copied = (await page.evaluate(
    () => (window as unknown as { __copiedText: string | null }).__copiedText,
  )) as string;
  const link = new URL(copied, page.url());
  expect(link.searchParams.get("glow")).toBe("1");
  expect(link.searchParams.get("pink")).toBe("1");
  expect(link.searchParams.get("prism")).toBe("1");

  const fresh = await context.newPage();
  await fresh.goto(link.href);
  await expect(fresh.locator("#scene")).toHaveAttribute("data-entry-active", "false", {
    timeout: 30_000,
  });
  await expectGlowChecked(fresh, true);
  await expect(fresh.locator("body")).toHaveClass(/pink-mode/, { timeout: 15_000 });
  await expect(fresh.locator("body")).toHaveClass(/prism-mode/, { timeout: 15_000 });
  await fresh.close();
});
