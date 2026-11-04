import { test, expect } from "@playwright/test";

async function openLab(page: import("@playwright/test").Page) {
  const status = page.locator("#lab-status");
  if ((await status.textContent()) !== "ON") {
    await page.keyboard.press("l");
    await expect(status).toHaveText("ON", { timeout: 15000 });
  }
}

function glowCheckbox(page: import("@playwright/test").Page) {
  return page.locator('.tp-lblv:has-text("Glow") input');
}

test("O toggles Glow in the Lab checkbox and P and M still work afterward", async ({ page }) => {
  await page.goto("/?glow=0");
  await openLab(page);
  const glow = glowCheckbox(page);
  await expect.poll(async () => glow.isChecked()).toBe(false);

  await page.keyboard.press("o");
  await expect.poll(async () => glow.isChecked()).toBe(true);

  await page.keyboard.press("p");
  await expect(page.locator("body")).toHaveClass(/pink-mode/);
  await page.keyboard.press("m");
  await expect(page.locator("body")).toHaveClass(/prism-mode/);
});

test("Field Guide lists the O shortcut for Toggle Glow Mode", async ({ page }) => {
  await page.goto("/");
  await page.click("#guide-toggle");
  const row = page.locator(".shortcut-item", { hasText: "Toggle Glow Mode" });
  await expect(row.locator("kbd")).toHaveText("O");
});
