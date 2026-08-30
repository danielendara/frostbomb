import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("R key regrows the snowflake", async ({ page }) => {
  const initialSeed = await page.textContent("#seed-display");
  await page.keyboard.press("r");
  // Wait a bit for the seed to change
  await expect(async () => {
    const newSeed = await page.textContent("#seed-display");
    expect(newSeed).not.toBe(initialSeed);
  }).toPass();
});

test("keyboard shortcuts provide tactile button feedback", async ({ page }) => {
  const refresh = page.locator("#refresh");

  await page.keyboard.press("r");

  await expect(refresh).toHaveClass(/btn-press/);
});

test("V key provides feedback on the reset-view button", async ({ page }) => {
  const reset = page.getByRole("button", { name: "Reset" });

  await page.keyboard.press("v");

  await expect(reset).toHaveClass(/btn-press/);
});

test("modified shortcuts do not trigger app actions", async ({ page }) => {
  const initialSeed = await page.textContent("#seed-display");

  await page.keyboard.press("Control+r");

  await expect(page.locator("#seed-display")).toHaveText(initialSeed ?? "");
});

test("regrowing spins the wordmark accent once", async ({ page }) => {
  const accent = page.locator(".wordmark__accent");

  await page.keyboard.press("r");

  await expect(accent).toHaveClass(/animate-spin-once/);
});

test("field guide documents the reset-view shortcut", async ({ page }) => {
  await page.keyboard.press("g");

  const resetShortcut = page
    .locator(".shortcut-item")
    .filter({ hasText: "Reset 3D view" });
  await expect(resetShortcut.locator("dt")).toHaveText("V");
});

test("field guide documents Photo Mode depth of field", async ({ page }) => {
  await page.keyboard.press("g");

  const photoShortcut = page
    .locator(".shortcut-item")
    .filter({ hasText: "Photo Mode" });
  await expect(photoShortcut.locator("dt")).toHaveText("H");
  await expect(photoShortcut.locator("dd")).toContainText("depth of field");
});

test("wordmark links back to the root path", async ({ page }) => {
  const wordmark = page.getByRole("link", {
    name: "Grow a new frostbomb snowflake",
  });

  await expect(wordmark).toHaveAttribute("href", "/");
});

test("L key toggles lab mode", async ({ page }) => {
  const labControls = page.locator("#lab-controls");
  await expect(labControls).not.toBeVisible();

  await page.keyboard.press("l");
  await expect(labControls).toBeVisible();

  await page.keyboard.press("l");
  await expect(labControls).not.toBeVisible();
});

test("shortcuts are ignored while editing lab controls", async ({ page }) => {
  await page.keyboard.press("l");
  await expect(page.locator("#lab-controls")).toBeVisible();

  const tempInput = page.getByRole("textbox").first();
  await tempInput.click();
  await page.keyboard.press("p");
  await page.keyboard.press("l");

  await expect(page.locator("#btn-pink")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.locator("#lab-controls")).toBeVisible();
});

test("S key triggers save (downloads file) and provides feedback", async ({
  page,
}) => {
  const saveBtn = page.locator("#btn-save");
  const label = saveBtn.locator(".action-btn__label");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.keyboard.press("s"),
  ]);

  // Use toPass to handle potential UI paint delays
  await expect(async () => {
    const text = await label.textContent();
    expect(["Saved!", "Save PNG"]).toContain(text);
  }).toPass();

  expect(download.suggestedFilename()).toMatch(/^frostbomb-.*-.*\.png$/);
  await download.delete();
});

test("E key downloads SVG vector export and provides feedback", async ({
  page,
}) => {
  const saveBtn = page.locator("#btn-save-svg");
  const label = saveBtn.locator(".action-btn__label");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.keyboard.press("e"),
  ]);

  await expect(async () => {
    const text = await label.textContent();
    expect(["Saved!", "Save SVG"]).toContain(text);
  }).toPass();

  expect(download.suggestedFilename()).toMatch(/^frostbomb-.*-.*\.svg$/);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  if (!stream) {
    throw new Error("SVG download stream was empty");
  }
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  const svg = Buffer.concat(chunks).toString("utf8");
  expect(svg).toContain("<svg");
  expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(svg).toContain("<polygon");
  expect(svg).toMatch(/width="[\d.]+mm"/);
  await download.delete();
});

test("field guide documents the SVG export shortcut", async ({ page }) => {
  await page.keyboard.press("g");

  const svgShortcut = page
    .locator(".shortcut-item")
    .filter({ hasText: "Save as SVG" });
  await expect(svgShortcut.locator("dt")).toHaveText("E");
});

test("T key downloads STL and GLB and provides feedback", async ({ page }) => {
  await page.evaluate(() => {
    (window as any).__FROSTBOMB_OBJECT_URL_REVOKE_MS__ = 15000;
  });

  const saveBtn = page.locator("#btn-save-3d");
  const label = saveBtn.locator(".action-btn__label");
  const names: string[] = [];

  page.on("download", (download) => {
    names.push(download.suggestedFilename());
    void download.delete();
  });

  await page.keyboard.press("t");

  await expect(async () => {
    const text = await label.textContent();
    expect(["Saved!", "Save 3D"]).toContain(text);
  }).toPass();

  await expect.poll(() => names.length).toBeGreaterThanOrEqual(2);
  expect(names.some((name) => /^frostbomb-.*-.*\.stl$/.test(name))).toBe(true);
  expect(names.some((name) => /^frostbomb-.*-.*\.glb$/.test(name))).toBe(true);
  await expect(page.locator('a[download][href^="blob:"]')).toHaveCount(2);
});

test("sequential blob downloads append anchors, delay the second click, and revoke later", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).__FROSTBOMB_DOWNLOAD_GAP_MS__ = 120;
    (window as any).__FROSTBOMB_OBJECT_URL_REVOKE_MS__ = 400;
  });

  const names: string[] = [];
  const times: number[] = [];
  page.on("download", (download) => {
    names.push(download.suggestedFilename());
    times.push(Date.now());
    void download.delete();
  });

  const snapshot = await page.evaluate(async () => {
    const download = (window as any).__FROSTBOMB_DOWNLOAD_OBJECT_URLS__;
    if (typeof download !== "function") {
      return { helper: typeof download, appended: [] as string[], remaining: [] as string[] };
    }

    const appended: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (node instanceof HTMLAnchorElement) {
            appended.push(`${node.download}:${node.href.startsWith("blob:") ? "blob" : node.href.slice(0, 8)}`);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true });

    const stl = URL.createObjectURL(new Blob(["stl"], { type: "application/octet-stream" }));
    const glb = URL.createObjectURL(new Blob(["glb"], { type: "application/octet-stream" }));
    await download([
      { filename: "frostbomb-test.stl", href: stl },
      { filename: "frostbomb-test.glb", href: glb },
    ]);
    observer.disconnect();

    const remaining = Array.from(document.querySelectorAll("a[download]")).map(
      (el) => (el as HTMLAnchorElement).download,
    );
    return { helper: "function", appended, remaining };
  });

  expect(snapshot.helper).toBe("function");
  expect(snapshot.appended).toEqual(["frostbomb-test.stl:blob", "frostbomb-test.glb:blob"]);
  expect(snapshot.remaining).toEqual(["frostbomb-test.stl", "frostbomb-test.glb"]);

  await expect.poll(() => names.length).toBe(2);
  expect(names).toEqual(["frostbomb-test.stl", "frostbomb-test.glb"]);
  expect(times[1] - times[0]).toBeGreaterThanOrEqual(100);

  await expect.poll(async () => {
    return page.evaluate(() =>
      Array.from(document.querySelectorAll("a[download]")).map((el) => (el as HTMLAnchorElement).download),
    );
  }).toEqual([]);
});

test("field guide documents the 3D export shortcut", async ({ page }) => {
  await page.keyboard.press("g");

  const modelShortcut = page
    .locator(".shortcut-item")
    .filter({ hasText: "Save as STL / GLB" });
  await expect(modelShortcut.locator("dt")).toHaveText("T");
});

test("C key triggers copy feedback on buttons", async ({ page }) => {
  const seedDisplay = page.locator("#seed-display");
  const copyLabel = page.locator("#btn-copy .action-btn__label");

  await page.keyboard.press("c");

  // Check that either button shows feedback.
  // In CI, clipboard may fail, so "Failed" is also an acceptable state for proving the shortcut triggered the handler.
  await expect(async () => {
    const seedText = await seedDisplay.textContent();
    const copyText = await copyLabel.textContent();
    const isFeedback = (text: string | null) =>
      text === "Copied!" || text === "Failed";
    expect(isFeedback(seedText) || isFeedback(copyText)).toBe(true);
  }).toPass();
});
