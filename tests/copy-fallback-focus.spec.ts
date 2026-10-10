import { test, expect, type Page } from "@playwright/test";

async function setup(page: Page, throwingExec = false) {
  await page.addInitScript((throwExec) => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
    if (throwExec) {
      document.execCommand = () => {
        throw new Error("exec blocked");
      };
    }
  }, throwingExec);
  await page.goto("/?seed=frost1");
}

for (const id of ["btn-copy", "btn-copy-seed"]) {
  test(`#${id} keeps focus when the clipboard fallback runs`, async ({ page }) => {
    const warned = page.waitForEvent("console", (m) =>
      m.text().includes("Clipboard API failed"),
    );
    await setup(page);
    const btn = page.locator(`#${id}`);
    await btn.focus();
    await page.keyboard.press("Enter");
    await warned;
    await expect(btn).toContainText(/Copied!|Failed/);
    await expect(btn).toBeFocused();
    await expect(page.locator("textarea")).toHaveCount(0);
  });
}

test("focus is restored and textarea removed when execCommand throws", async ({ page }) => {
  const warned = page.waitForEvent("console", (m) =>
    m.text().includes("Clipboard API failed"),
  );
  await setup(page, true);
  const btn = page.locator("#btn-copy");
  await btn.focus();
  await page.keyboard.press("Enter");
  await warned;
  await expect(btn).toContainText("Failed");
  await expect(btn).toBeFocused();
  await expect(page.locator("textarea")).toHaveCount(0);
});
