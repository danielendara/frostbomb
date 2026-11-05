import { chromium } from "@playwright/test";

const SLOW_DELTA = 1 / 30;
const out = process.argv[2] ?? "/opt/cursor/artifacts/proof-483/lab-quality-lite-after-demotion.png";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://127.0.0.1:5173/?seed=abcde&quality=rich");
await page.click("#lab-toggle");
await page.waitForSelector("#lab-status", { state: "visible" });
await page.waitForFunction(
  () =>
    typeof window.__FROSTBOMB_TIER_GOVERNOR_TICK__ === "function",
);
await page.evaluate((delta) => {
  const tick = window.__FROSTBOMB_TIER_GOVERNOR_TICK__;
  for (let i = 0; i < 200; i++) tick(delta);
}, SLOW_DELTA);
await page.waitForSelector("canvas#scene[data-quality='lite']");
const select = page.locator(".tp-lblv", { hasText: "Quality" }).locator("select");
await select.waitFor({ state: "visible" });
const box = await page.locator("#pane-mount").boundingBox();
if (box) {
  await page.screenshot({
    path: out,
    clip: { x: box.x, y: box.y, width: Math.min(box.width, 360), height: Math.min(box.height, 420) },
  });
} else {
  await page.screenshot({ path: out, fullPage: false });
}
await browser.close();
console.log("saved", out);
