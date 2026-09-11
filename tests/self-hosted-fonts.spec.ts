import { test, expect } from "@playwright/test";

test("first paint does not request Google Fonts and loads self-hosted faces", async ({
  page,
}) => {
  const googleFontUrls: string[] = [];
  const selfHostedFonts: string[] = [];

  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")) {
      googleFontUrls.push(url);
    }
    if (url.includes("/fonts/") && url.endsWith(".woff2")) {
      selfHostedFonts.push(url);
    }
  });

  await page.goto("/");
  await expect(page.locator(".wordmark")).toBeVisible();

  expect(googleFontUrls).toEqual([]);
  expect(selfHostedFonts.length).toBeGreaterThan(0);
  expect(
    selfHostedFonts.some((url) => url.includes("cormorant-garamond")),
  ).toBe(true);
});
