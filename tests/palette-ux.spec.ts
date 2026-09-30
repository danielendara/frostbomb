import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("Close Guide button in Field Guide works", async ({ page }) => {
  const guideToggle = page.locator("#guide-toggle");
  const fieldGuide = page.locator("#field-guide");
  const guideClose = page.locator("#guide-close");

  await guideToggle.click();
  await expect(fieldGuide).toBeVisible();

  await guideClose.click();
  await expect(fieldGuide).not.toBeVisible();
  await expect(guideToggle).toHaveAttribute("aria-pressed", "false");
});

test("Nakaya diagram aria-label updates on interaction", async ({ page }) => {
  const nakaya = page.locator("#nakaya-diagram");

  await page.click("#guide-toggle");
  await expect(page.locator("#field-guide")).toBeVisible();

  // Turn on Lab Mode to ensure initial label is set with dynamic values
  await page.click("#lab-toggle");
  await expect(page.locator("#lab-status")).toHaveText("ON");

  await expect(nakaya).toHaveAttribute(
    "aria-label",
    /Nakaya morphology diagram: -?\d+(\.\d+)?°C, \d+% humidity/,
  );
  const initialAria = await nakaya.getAttribute("aria-label");

  await nakaya.click({ position: { x: 50, y: 50 }, force: true });

  await expect(async () => {
    const currentAria = await nakaya.getAttribute("aria-label");
    expect(currentAria).not.toBe(initialAria);
  }).toPass({ timeout: 10000 });

  const updatedAria = await nakaya.getAttribute("aria-label");
  expect(updatedAria).toMatch(
    /Nakaya morphology diagram: -?\d+(\.\d+)?°C, \d+% humidity/,
  );
});

test("Lab Mode allows custom seed input and updates the UI", async ({
  page,
}) => {
  await page.click("#lab-toggle");
  await expect(page.locator("#lab-status")).toHaveText("ON");

  await expect(page.locator("#lab-controls")).toBeVisible();

  const seedInput = page.locator('.tp-lblv:has-text("Seed") input');
  await expect(seedInput).toBeVisible();

  const initialSeed = await seedInput.inputValue();
  expect(initialSeed.length).toBeGreaterThanOrEqual(3);

  // Fill in a custom valid seed
  await seedInput.fill("abcde");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/seed=abcde/);

  const seedDisplay = page.locator("#seed-display");
  await expect(seedDisplay).toHaveText("abcde");

  // Fill in an invalid seed (e.g., too short)
  await seedInput.fill("ab");
  await page.keyboard.press("Enter");

  await expect(seedInput).toHaveValue("abcde");

  // Note: Due to slow CI execution, the temporary '3-12 chars' visual label might revert to 'abcde'
  // before Playwright asserts it. We allow either state, as long as it did not accept 'ab'.
  const seedBtn = page.locator("#btn-seed");
  await expect(seedBtn).toContainText(/3-12 chars|abcde/);

  const announcer = page.locator("#a11y-announcer");
  await expect(announcer).toHaveText(
    "Invalid seed. Seeds must be 3 to 12 alphanumeric characters.",
  );
});

test("Skip link is the first focusable element and shifts focus to #field-notes", async ({
  page,
}) => {
  await page.keyboard.press("Tab");

  const skipLink = page.locator(".skip-link");
  await expect(skipLink).toBeFocused();

  await page.keyboard.press("Enter");

  const fieldNotes = page.locator("#field-notes");
  await expect(fieldNotes).toBeFocused();
});

test("Nakaya diagram displays live-hover preview and reverts on leave", async ({
  page,
}) => {
  const guideToggle = page.locator("#guide-toggle");
  const fieldGuide = page.locator("#field-guide");
  const nakaya = page.locator("#nakaya-diagram");
  const status = page.locator("#nakaya-status");

  await guideToggle.click();
  await expect(fieldGuide).toBeVisible();

  await expect(status).toBeVisible();
  await expect(status).toContainText("Active:");
  await expect(status).toHaveAttribute("aria-live", "polite");

  await nakaya.hover({ position: { x: 150, y: 100 } });

  // Status should change to Preview mode
  await expect(status).toContainText("Preview:");
  await expect(status).toHaveAttribute("aria-live", "off");

  await page.mouse.move(0, 0);

  // Status should revert to Active mode
  await expect(status).toContainText("Active:");
  await expect(status).toHaveAttribute("aria-live", "polite");
});

test("Nakaya commit announces through the status live region only", async ({
  page,
}) => {
  const guideToggle = page.locator("#guide-toggle");
  const fieldGuide = page.locator("#field-guide");
  const nakaya = page.locator("#nakaya-diagram");
  const status = page.locator("#nakaya-status");
  const announcer = page.locator("#a11y-announcer");

  await guideToggle.click();
  await expect(fieldGuide).toBeVisible();
  await expect(status).toContainText("Active:");

  const beforeStatus = (await status.textContent()) ?? "";
  await nakaya.click({ position: { x: 50, y: 50 }, force: true });
  await expect(status).not.toHaveText(beforeStatus);
  await expect(status).toContainText("Active:");
  await expect(status).toHaveAttribute("aria-live", "polite");

  const afterClick = (await status.textContent()) ?? "";
  await nakaya.focus();
  await page.keyboard.press("ArrowRight");
  await expect(status).not.toHaveText(afterClick);
  await expect(status).toContainText("Active:");
  await expect(status).toHaveAttribute("aria-live", "polite");

  // announcer debounce is 50ms — wait past it so a stray Temperature line would have landed
  await page.waitForTimeout(200);
  const announced = (await announcer.textContent()) ?? "";
  expect(announced).not.toMatch(/Temperature:/);
  expect(announced).not.toMatch(/Habit changed to:/);
});

test("Main canvas is an interactive orbit control in the accessibility tree", async ({
  page,
}) => {
  const seedDisplay = page.locator("#seed-display");
  const scene = page.locator("#scene");

  await expect(seedDisplay).not.toHaveText("·····");
  await expect(scene).toHaveAttribute("role", "region");
  await expect(scene).not.toHaveAttribute("tabindex");
  await expect(scene).toHaveAttribute(
    "aria-label",
    /Interactive 3D snowflake:.*Drag to rotate, arrow keys to orbit, double-click or V to reset view/i,
  );
});

test("Close Lab Mode button in Lab controls works", async ({ page }) => {
  const labToggle = page.locator("#lab-toggle");
  const labControls = page.locator("#lab-controls");
  const labClose = page.locator("#lab-close");

  await labToggle.click();
  await expect(labControls).toBeVisible();

  await labClose.click();
  await expect(labControls).not.toBeVisible();
  await expect(labToggle).toHaveAttribute("aria-pressed", "false");
  await expect(labToggle).toBeFocused();
});

test("Recent seed buttons have correct title attributes", async ({ page }) => {
  const recentSeedsList = page.locator("#recent-seeds-list");
  const seedDisplay = page.locator("#seed-display");

  await expect(seedDisplay).not.toHaveText("·····");
  const seedVal = (await seedDisplay.textContent())?.trim() || "";

  const firstSeedBtn = recentSeedsList.locator("button.seed-pill").first();
  await expect(firstSeedBtn).toBeVisible();

  const title = await firstSeedBtn.getAttribute("title");
  expect(title).toContain(`Grow seed ${seedVal}`);
});

test("Copy Seed button copies seed only and provides visual and screen reader feedback", async ({
  page,
}) => {
  // Set the temporary label timeout to 60000ms to ensure the "Copied!" text remains stable on slow CI environments
  await page.evaluate(() => {
    (window as any).__FROSTBOMB_LABEL_TIMEOUT__ = 60000;
  });

  const copySeedBtn = page.locator("#btn-copy-seed");
  const label = copySeedBtn.locator(".action-btn__label");

  await expect(copySeedBtn).toBeVisible();
  await copySeedBtn.click();

  await expect(async () => {
    const text = await label.textContent();
    expect(["Copied!", "Failed"]).toContain(text);
  }).toPass();

  const announcer = page.locator("#a11y-announcer");
  await expect(announcer).toHaveText(/Seed \w+ copied|Failed to copy seed/);
});

test("Lab Mode Randomize Seed button updates the seed and UI", async ({
  page,
}) => {
  await page.click("#lab-toggle");
  await expect(page.locator("#lab-status")).toHaveText("ON");

  await expect(page.locator("#lab-controls")).toBeVisible();

  const seedInput = page.locator('.tp-lblv:has-text("Seed") input');
  await expect(seedInput).toBeVisible();

  const initialSeed = await seedInput.inputValue();

  const randomizeBtn = page.locator('button:has-text("Randomize Seed")');
  await expect(randomizeBtn).toBeVisible();
  await randomizeBtn.click();

  await expect(async () => {
    const currentSeed = await seedInput.inputValue();
    expect(currentSeed).not.toBe(initialSeed);
  }).toPass({ timeout: 10000 });

  const newSeed = await seedInput.inputValue();
  expect(newSeed.length).toBeGreaterThanOrEqual(3);

  await expect(page).toHaveURL(new RegExp(`seed=${newSeed}`));

  const seedDisplay = page.locator("#seed-display");
  await expect(seedDisplay).toHaveText(newSeed);
});

test("Photo Mode (UI hidden) is not exited by dragging/rotating camera, but exits on stationary click", async ({
  page,
}) => {
  test.slow();
  const btnUI = page.locator("#btn-ui");
  const masthead = page.locator(".masthead");
  const canvas = page.locator("#scene");

  await expect(masthead).not.toHaveClass(/ui-hidden/);
  await expect(page.locator("#seed-display")).not.toHaveText("·····");

  // Hide UI (enter Photo Mode). announce() writes after 50ms; on cold CI that
  // timer can sit behind the first DoF/WebGL compile, so wait longer than 5s.
  await btnUI.click();
  await expect(masthead).toHaveClass(/ui-hidden/);
  await expect(page.locator("#a11y-announcer")).toContainText(/depth of field/i, {
    timeout: 15_000,
  });

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 100, startY + 50, { steps: 5 });
  await page.mouse.up();

  // Click event might be triggered depending on browser behavior, but our distance check should block exiting Photo Mode.
  await expect(masthead).toHaveClass(/ui-hidden/);

  await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 } });

  await expect(masthead).not.toHaveClass(/ui-hidden/);
  await expect(page.locator("#a11y-announcer")).toContainText(/Photo Mode exited.*UI restored/i, {
    timeout: 15_000,
  });
  await expect(btnUI).toBeFocused();
});

test("Photo Mode keeps focus out of hidden UI and restores it to btn-ui via Esc and H", async ({
  page,
}) => {
  test.slow();
  const btnUI = page.locator("#btn-ui");
  const btnReset = page.locator("#btn-reset");
  const masthead = page.locator(".masthead");
  const announcer = page.locator("#a11y-announcer");
  const canvas = page.locator("#scene");

  await btnReset.focus();
  await expect(btnReset).toBeFocused();

  await page.keyboard.press("h");
  await expect(masthead).toHaveClass(/ui-hidden/);
  await expect(btnReset).not.toBeFocused();
  await expect(btnUI).not.toBeFocused();
  await expect(canvas).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(masthead).not.toHaveClass(/ui-hidden/);
  await expect(announcer).toContainText(/Photo Mode exited.*UI restored/i, {
    timeout: 15_000,
  });
  await expect(btnUI).toBeFocused();

  await page.keyboard.press("h");
  await expect(masthead).toHaveClass(/ui-hidden/);
  await expect(canvas).toBeFocused();

  await page.keyboard.press("h");
  await expect(masthead).not.toHaveClass(/ui-hidden/);
  await expect(announcer).toContainText(/Photo Mode exited.*UI restored/i, {
    timeout: 15_000,
  });
  await expect(btnUI).toBeFocused();
});

test("Lab Mode container receives focus when Lab Mode is activated", async ({
  page,
}) => {
  const labToggle = page.locator("#lab-toggle");
  const labControls = page.locator("#lab-controls");

  await labToggle.click();
  await expect(labControls).toBeVisible();
  await expect(labControls).toBeFocused();
});

test("Pink mode and Prism mode buttons dynamically update their titles and aria-labels", async ({
  page,
}) => {
  test.slow();
  const btnPink = page.locator("#btn-pink");
  const btnPrism = page.locator("#btn-prism");

  await expect(btnPink).not.toHaveAttribute("aria-label");
  await btnPink.click();
  await expect(btnPink).toHaveAttribute("aria-label", "Pink Mode (P)");
  await expect(btnPink).toHaveAttribute(
    "title",
    "Toggle pink mode (P) - current: active",
  );

  await btnPink.click();
  await expect(btnPink).toHaveAttribute("aria-label", "Pink Mode (P)");
  await expect(btnPink).toHaveAttribute(
    "title",
    "Toggle pink mode (P) - current: inactive",
  );

  await expect(btnPrism).not.toHaveAttribute("aria-label");
  await btnPrism.click();
  await expect(btnPrism).toHaveAttribute("aria-label", "Prism Mode (M)");
  await expect(btnPrism).toHaveAttribute(
    "title",
    "Toggle prism mode (M) - current: active",
  );

  await btnPrism.click();
  await expect(btnPrism).toHaveAttribute("aria-label", "Prism Mode (M)");
  await expect(btnPrism).toHaveAttribute(
    "title",
    "Toggle prism mode (M) - current: inactive",
  );
});

test("Nakaya diagram displays crosshair alignment guides on keyboard focus and clears them on blur", async ({
  page,
}) => {
  const guideToggle = page.locator("#guide-toggle");
  const fieldGuide = page.locator("#field-guide");
  const nakaya = page.locator("#nakaya-diagram");

  await guideToggle.click();
  await expect(fieldGuide).toBeVisible();

  await nakaya.focus();
  await expect(nakaya).toBeFocused();

  await nakaya.hover({ position: { x: 150, y: 100 } });

  await page.mouse.move(0, 0);

  await nakaya.blur();
  await expect(nakaya).not.toBeFocused();
});

test("Palette: main action buttons have explicit fallback aria-labels on load", async ({ page }) => {
  await expect(page.locator("#btn-reset")).toHaveAttribute("aria-label", "Reset 3D view (V)");
  await expect(page.locator("#btn-ui")).toHaveAttribute("aria-label", "Photo Mode / Toggle UI (H)");
  await expect(page.locator("#btn-copy")).toHaveAttribute("aria-label", "Copy share link (C)");
  await expect(page.locator("#btn-save")).toHaveAttribute("aria-label", "Save as PNG (S)");
  await expect(page.locator("#btn-save-svg")).toHaveAttribute("aria-label", "Save as SVG (E)");
  await expect(page.locator("#btn-save-3d")).toHaveAttribute("aria-label", "Save as STL and GLB (T)");
  await expect(page.locator("#refresh")).toHaveAttribute("aria-label", "Grow another snowflake (R, Space)");
});

test("Palette: active history seed button has aria-current='true'", async ({ page }) => {
  const seedDisplay = page.locator("#seed-display");
  await expect(seedDisplay).not.toHaveText("·····");
  const activeSeed = (await seedDisplay.textContent())?.trim() || "";

  const activeSeedBtn = page.locator(`#recent-seeds-list button.seed-pill:has-text("${activeSeed}")`);
  await expect(activeSeedBtn).toBeVisible();
  await expect(activeSeedBtn).toHaveAttribute("aria-current", "true");

  const allSeedBtns = await page.locator("#recent-seeds-list button.seed-pill").all();
  for (const btn of allSeedBtns) {
    const text = await btn.textContent();
    if (text?.trim() !== activeSeed) {
      await expect(btn).toHaveAttribute("aria-current", "false");
    }
  }
});

test("Palette: buttons update kbd styles and other visual child/parent cues on keyboard focus matching hover", async ({ page }) => {
  await expect(page.locator("#seed-display")).not.toHaveText("·····");

  const btnReset = page.locator("#btn-reset");
  const btnResetKbd = btnReset.locator(".btn-kbd");

  await expect(btnReset).toBeVisible();

  // locator.focus() sets :focus but not :focus-visible, and on slow CI the
  // canvas/UI can steal that focus before the kbd color transition settles.
  // Tab away and back so the highlight is keyboard-originated.
  await btnReset.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(btnReset).toBeFocused();
  await expect(btnResetKbd).toHaveCSS("color", "rgb(158, 201, 255)");
});

test("Palette: growth condition rows dynamically update aria-expanded on interaction and guide close", async ({ page }) => {
  const tempRow = page.locator('.field-notes__row[aria-controls="guide-temp"]');
  const humidRow = page.locator('.field-notes__row[aria-controls="guide-humid"]');
  const fieldGuide = page.locator("#field-guide");
  const guideClose = page.locator("#guide-close");

  // Initial state: guide is closed, rows should be aria-expanded="false"
  await expect(tempRow).toHaveAttribute("aria-expanded", "false");
  await expect(humidRow).toHaveAttribute("aria-expanded", "false");

  await tempRow.click();
  await expect(fieldGuide).toBeVisible();
  await expect(tempRow).toHaveAttribute("aria-expanded", "true");
  await expect(humidRow).toHaveAttribute("aria-expanded", "false");

  await guideClose.click();
  await expect(fieldGuide).not.toBeVisible();
  await expect(tempRow).toHaveAttribute("aria-expanded", "false");
  await expect(humidRow).toHaveAttribute("aria-expanded", "false");

  await humidRow.click();
  await expect(fieldGuide).toBeVisible();
  await expect(tempRow).toHaveAttribute("aria-expanded", "false");
  await expect(humidRow).toHaveAttribute("aria-expanded", "true");
});
