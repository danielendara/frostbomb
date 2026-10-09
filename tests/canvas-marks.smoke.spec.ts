import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const MARKS = [
  "frostbomb:first-flake-built",
  "frostbomb:first-frame-rendered",
  "frostbomb:postprocessing-ready",
] as const;

test("startup marks fire and the canvas is not blank after grow", async ({ page }) => {
  await page.goto("/");

  await page.waitForFunction((names) => {
    const found = new Set(performance.getEntriesByType("mark").map((entry) => entry.name));
    return names.every((name) => found.has(name));
  }, MARKS);

  const present = await page.evaluate((_names) => {
    const marks = performance.getEntriesByType("mark").map((entry) => entry.name);
    const measures = performance.getEntriesByType("measure").map((entry) => entry.name);
    return { marks, measures };
  }, MARKS);

  for (const name of MARKS) {
    expect(present.marks).toContain(name);
    expect(present.measures).toContain(`${name}:since-nav`);
  }

  await page.locator("#refresh").click();
  await expect(page.locator("#seed-display")).not.toHaveText("·····");

  await expect(page.locator("#scene")).toHaveAttribute("data-scene-nonblank", "true");

  const box = await page.locator("#scene").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
});
