import { test, expect } from "@playwright/test";

test("action rail divider matches the stacked vertical layout", async ({
  page,
}) => {
  await page.goto("/");

  const divider = page.locator(".actions__divider");
  await expect(divider).toHaveAttribute("role", "separator");
  await expect(divider).toHaveAttribute("aria-orientation", "horizontal");

  const box = await divider.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(box!.height);
});
