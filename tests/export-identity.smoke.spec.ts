import { expect, test, type Download, type Page } from "@playwright/test";
import { readDownload } from "./e2e-helpers";

/**
 * #343 — Save 3D names the files from the crystal captured at click time.
 * Regrow stays available while the exporter module loads.
 */

const DOWNLOAD_TEST_GAP_MS = 250;

async function waitSave3dIdle(page: Page): Promise<void> {
  await expect(page.locator("#btn-save-3d")).not.toHaveAttribute("aria-busy", "true", {
    timeout: 30_000,
  });
}

async function armObjectUrlTestHooks(page: Page): Promise<void> {
  await page.evaluate((gapMs) => {
    (window as unknown as { __FROSTBOMB_OBJECT_URL_REVOKE_MS__: number }).__FROSTBOMB_OBJECT_URL_REVOKE_MS__ =
      15000;
    (window as unknown as { __FROSTBOMB_DOWNLOAD_GAP_MS__: number }).__FROSTBOMB_DOWNLOAD_GAP_MS__ = gapMs;
  }, DOWNLOAD_TEST_GAP_MS);
}

function waitForTypedDownload(page: Page, extension: ".stl" | ".glb"): Promise<Download> {
  return page.waitForEvent("download", {
    predicate: (download) => download.suggestedFilename().endsWith(extension),
  });
}

async function save3d(page: Page): Promise<{ stl: string; glb: string }> {
  await armObjectUrlTestHooks(page);
  await waitSave3dIdle(page);
  const saveBtn = page.locator("#btn-save-3d");
  const stlDownload = waitForTypedDownload(page, ".stl");
  const glbDownload = waitForTypedDownload(page, ".glb");
  await saveBtn.click();
  const [stlFile, glbFile] = await Promise.all([stlDownload, glbDownload]);
  await waitSave3dIdle(page);
  const files = [await readDownload(stlFile), await readDownload(glbFile)];
  const stl = files.find((file) => file.name.endsWith(".stl"));
  const glb = files.find((file) => file.name.endsWith(".glb"));
  expect(stl && glb).toBeTruthy();
  return { stl: stl!.sha, glb: glb!.sha };
}

test("Save 3D filenames stay on the crystal captured before the exporter loads", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.goto("/?seed=abcde");
  await expect(page.locator("#seed-display")).toHaveText("abcde");
  await expect(page.locator("#stat-habit")).toHaveText("Fernlike dendrite");
  const original = await save3d(page);

  // A second document has not cached the lazy exporter, so the route can hold
  // the import while this page regrows.
  const delayed = await page.context().newPage();
  let releaseExport!: () => void;
  const exportGate = new Promise<void>((resolve) => {
    releaseExport = resolve;
  });
  let markRequested!: () => void;
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve;
  });
  await delayed.route(/mesh-export\.ts/, async (route) => {
    markRequested();
    await exportGate;
    await route.continue();
  });

  await delayed.goto("/?seed=abcde");
  await expect(delayed.locator("#seed-display")).toHaveText("abcde");
  await armObjectUrlTestHooks(delayed);
  await waitSave3dIdle(delayed);

  const delayedSave = delayed.locator("#btn-save-3d");
  const stlDownload = waitForTypedDownload(delayed, ".stl");
  const glbDownload = waitForTypedDownload(delayed, ".glb");

  await delayedSave.click();
  await requested;
  await delayed.keyboard.press("r");
  await expect(delayed.locator("#seed-display")).not.toHaveText("abcde", { ignoreCase: true });
  const regrownSeed = (await delayed.locator("#seed-display").innerText()).toLowerCase();
  releaseExport();

  const [stlDownloadResult, glbDownloadResult] = await Promise.all([stlDownload, glbDownload]);
  await waitSave3dIdle(delayed);
  const saved = [await readDownload(stlDownloadResult), await readDownload(glbDownloadResult)];
  const names = saved.map((file) => file.name).sort();
  expect(names).toEqual([
    "frostbomb-fernlike-dendrite-abcde.glb",
    "frostbomb-fernlike-dendrite-abcde.stl",
  ]);
  for (const name of names) expect(name).not.toContain(regrownSeed);

  const stl = saved.find((file) => file.name.endsWith(".stl"))!;
  const glb = saved.find((file) => file.name.endsWith(".glb"))!;
  expect(stl.sha).toBe(original.stl);
  expect(glb.sha).toBe(original.glb);

  await delayed.close();

  await page.goto(`/?seed=${regrownSeed}`);
  await expect(page.locator("#seed-display")).toHaveText(regrownSeed.toUpperCase(), {
    ignoreCase: true,
  });
  const regrown = await save3d(page);
  expect(regrown.stl).not.toBe(original.stl);
});
