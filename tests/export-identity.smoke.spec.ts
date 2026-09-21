import { createHash } from "node:crypto";
import { expect, test, type Download, type Page } from "@playwright/test";

/**
 * #343 — Save 3D names the files from the crystal captured at click time.
 * Regrow stays available while the exporter module loads.
 */

async function readDownload(download: Download): Promise<{ name: string; sha: string }> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error(`Empty download: ${download.suggestedFilename()}`);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  await download.delete();
  return {
    name: download.suggestedFilename(),
    sha: createHash("sha256").update(body).digest("hex"),
  };
}

async function save3d(page: Page): Promise<{ stl: string; glb: string }> {
  const files: { name: string; sha: string }[] = [];
  const onDownload = (download: Download) => {
    void readDownload(download).then((file) => files.push(file));
  };
  page.on("download", onDownload);
  await page.evaluate(() => {
    (window as unknown as { __FROSTBOMB_OBJECT_URL_REVOKE_MS__: number }).__FROSTBOMB_OBJECT_URL_REVOKE_MS__ =
      15000;
  });
  await page.locator("#btn-save-3d").click();
  await expect.poll(() => files.length, { timeout: 20000 }).toBe(2);
  page.off("download", onDownload);
  const stl = files.find((file) => file.name.endsWith(".stl"));
  const glb = files.find((file) => file.name.endsWith(".glb"));
  expect(stl && glb).toBeTruthy();
  return { stl: stl!.sha, glb: glb!.sha };
}

test("Save 3D filenames stay on the crystal captured before the exporter loads", async ({
  page,
}) => {
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
  await delayed.evaluate(() => {
    (window as unknown as { __FROSTBOMB_OBJECT_URL_REVOKE_MS__: number }).__FROSTBOMB_OBJECT_URL_REVOKE_MS__ =
      15000;
  });

  const saved: { name: string; sha: string }[] = [];
  delayed.on("download", (download) => {
    void readDownload(download).then((file) => saved.push(file));
  });

  await delayed.locator("#btn-save-3d").click();
  await requested;
  await delayed.keyboard.press("r");
  await expect(delayed.locator("#seed-display")).not.toHaveText("abcde", { ignoreCase: true });
  const regrownSeed = (await delayed.locator("#seed-display").innerText()).toLowerCase();
  releaseExport();

  await expect.poll(() => saved.length, { timeout: 20000 }).toBe(2);
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

  await page.goto(`/?seed=${regrownSeed}`);
  await expect(page.locator("#seed-display")).toHaveText(regrownSeed.toUpperCase(), {
    ignoreCase: true,
  });
  const regrown = await save3d(page);
  expect(regrown.stl).not.toBe(original.stl);
});
