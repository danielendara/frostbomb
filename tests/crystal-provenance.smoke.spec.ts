import { expect, test, type Page } from "@playwright/test";
import { stubClipboard } from "./e2e-helpers";

/**
 * #341 — a copied or history-restored crystal is the same geometry, not just
 * the same seed label. Sampled links omit t/ss; explicit Lab links keep them.
 */

function normalizedPolygons(svg: string): string[] {
  return [...svg.matchAll(/points="([^"]*)"/g)]
    .map((match) => match[1].trim().replace(/\s+/g, " "))
    .sort();
}

async function downloadPolygons(page: Page): Promise<string[]> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#btn-save-svg").click(),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error("SVG download stream was empty");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await download.delete();
  const svg = Buffer.concat(chunks).toString("utf8");
  const polygons = normalizedPolygons(svg);
  expect(polygons.length).toBeGreaterThan(0);
  return polygons;
}

async function copiedUrl(page: Page): Promise<URL> {
  await page.evaluate(() => {
    (window as unknown as { __copiedText: string | null }).__copiedText = null;
  });
  await page.locator("#btn-copy").click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __copiedText: string | null }).__copiedText))
    .not.toBeNull();
  const text = await page.evaluate(
    () => (window as unknown as { __copiedText: string | null }).__copiedText,
  );
  return new URL(text!);
}

test("Copy Link of a sampled crystal reopens the same geometry", async ({ page }) => {
  await stubClipboard(page);
  await page.goto("/?seed=abcde");
  await expect(page.locator("#seed-display")).toHaveText("abcde");
  await expect(page.locator("#stat-branches")).toHaveText("301");

  const before = await downloadPolygons(page);
  const url = await copiedUrl(page);
  expect(url.searchParams.get("seed")).toBe("abcde");
  expect(url.searchParams.get("t")).toBeNull();
  expect(url.searchParams.get("ss")).toBeNull();

  await page.goto(`${url.pathname}${url.search}`);
  await expect(page.locator("#stat-branches")).toHaveText("301");
  expect(await downloadPolygons(page)).toEqual(before);
});

test("Back and Forward restore sampled geometry, not the rounded Lab point", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await expect(page.locator("#stat-branches")).toHaveText("301");
  const first = await downloadPolygons(page);

  await page.locator("#refresh").click();
  await expect(page.locator("#seed-display")).not.toHaveText("abcde", { ignoreCase: true });
  expect(new URL(page.url()).searchParams.get("t")).toBeNull();
  expect(new URL(page.url()).searchParams.get("ss")).toBeNull();
  const secondSeed = (await page.locator("#seed-display").innerText()).toLowerCase();
  const secondBranches = await page.locator("#stat-branches").innerText();
  const second = await downloadPolygons(page);
  expect(second).not.toEqual(first);

  await page.goBack();
  await expect(page.locator("#seed-display")).toHaveText("abcde");
  await expect(page.locator("#stat-branches")).toHaveText("301");
  expect(await downloadPolygons(page)).toEqual(first);

  await page.goForward();
  await expect(page.locator("#seed-display")).toHaveText(secondSeed.toUpperCase(), { ignoreCase: true });
  await expect(page.locator("#stat-branches")).toHaveText(secondBranches);
  expect(await downloadPolygons(page)).toEqual(second);
});

test("an explicit Lab link and a later seed edit round-trip at URL precision", async ({ page }) => {
  await stubClipboard(page);
  await page.goto("/?seed=abcde&t=-12.54&ss=80.4");
  await expect(page.locator("#seed-display")).toHaveText("abcde");

  const branches = await page.locator("#stat-branches").innerText();
  const offGrid = await copiedUrl(page);
  expect(offGrid.searchParams.get("t")).toBe("-12.5");
  expect(offGrid.searchParams.get("ss")).toBe("80");
  const grown = await downloadPolygons(page);

  await page.goto(`${offGrid.pathname}${offGrid.search}`);
  await expect(page.locator("#seed-display")).toHaveText("abcde");
  await expect(page.locator("#stat-branches")).toHaveText(branches);
  expect(await downloadPolygons(page)).toEqual(grown);

  await page.goto("/?seed=abcde&t=-15&ss=60&lab=1");
  await expect(page.locator("#lab-controls")).toBeVisible();
  const seedInput = page.locator('.tp-lblv:has-text("Seed") input');
  await expect(seedInput).toBeVisible();
  await expect(page.locator("#stat-branches")).toHaveText("241");

  await seedInput.fill("fghij");
  await seedInput.press("Tab");
  await expect.poll(() => new URL(page.url()).searchParams.get("seed")).toBe("fghij");
  expect(new URL(page.url()).searchParams.get("t")).toBe("-15.0");
  expect(new URL(page.url()).searchParams.get("ss")).toBe("60");

  const edited = await downloadPolygons(page);
  const editedUrl = await copiedUrl(page);
  expect(editedUrl.searchParams.get("seed")).toBe("fghij");
  expect(editedUrl.searchParams.get("t")).toBe("-15.0");
  expect(editedUrl.searchParams.get("ss")).toBe("60");

  await page.goto(`${editedUrl.pathname}${editedUrl.search}`);
  await expect(page.locator("#seed-display")).toHaveText("fghij");
  expect(await downloadPolygons(page)).toEqual(edited);

  // The old explicit point still means the manual crystal, not a resample.
  await page.goto("/?seed=abcde&t=-12.9&ss=92");
  await expect(page.locator("#stat-branches")).not.toHaveText("301");
});
