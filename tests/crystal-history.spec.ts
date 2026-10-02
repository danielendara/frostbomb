import { test, expect } from "@playwright/test";

/**
 * #316 — Back goes back a crystal.
 *
 * Deliberate crystal changes push a history entry; a slider drag does not.
 */

// The display is styled uppercase; the seed itself is lowercase.
async function currentSeed(page: import("@playwright/test").Page) {
  return (await page.locator("#seed-display").innerText()).toLowerCase();
}

async function expectSeed(page: import("@playwright/test").Page, seed: string) {
  await expect(page.locator("#seed-display")).toHaveText(seed.toUpperCase(), { ignoreCase: true });
}

test("grow three crystals, then Back twice returns to the first", async ({ page }) => {
  await page.goto("/?seed=abcde");
  const first = await currentSeed(page);
  expect(first).toBe("abcde");

  await page.locator("#refresh").click();
  const second = await currentSeed(page);
  await page.locator("#refresh").click();
  const third = await currentSeed(page);
  expect(new Set([first, second, third]).size).toBe(3);

  await page.goBack();
  await expectSeed(page, second);

  await page.goBack();
  await expectSeed(page, first);

  // The canvas still shows a crystal — a restore must never blank it.
  const drawn = await page.evaluate(() => {
    const canvas = document.getElementById("scene") as HTMLCanvasElement | null;
    return Boolean(canvas && canvas.width > 0 && canvas.height > 0);
  });
  expect(drawn).toBe(true);

  // Forward works too: the same state the equivalent share link would produce.
  await page.goForward();
  await expectSeed(page, second);
});

test("a look toggle coalesces into the current entry instead of pushing one", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await expectSeed(page, "abcde");

  const before = await page.evaluate(() => window.history.length);
  await page.locator("#btn-pink").click();
  await page.locator("#btn-prism").click();
  const afterToggles = await page.evaluate(() => window.history.length);
  expect(afterToggles).toBe(before);

  // ...while growing a crystal does push one.
  await page.locator("#refresh").click();
  const afterGrow = await page.evaluate(() => window.history.length);
  expect(afterGrow).toBe(before + 1);

  await page.goBack();
  await expectSeed(page, "abcde");
});

/**
 * #365 — re-growing the crystal already on screen must not push a duplicate
 * entry: Today's crystal on D, pressed twice, is one Back step, not two.
 */
test("pressing D twice pushes one entry, and Back returns to the crystal before the first D", async ({
  page,
}) => {
  await page.goto("/?seed=abcde");
  await expectSeed(page, "abcde");
  const before = await page.evaluate(() => window.history.length);

  await page.keyboard.press("d");
  const daily = await currentSeed(page);
  expect(daily).not.toBe("abcde");
  await page.keyboard.press("d");
  await expectSeed(page, daily);

  const after = await page.evaluate(() => window.history.length);
  expect(after).toBe(before + 1);

  await page.goBack();
  await expectSeed(page, "abcde");
});

/**
 * #331 — Back/Forward restores the look recorded in the popped entry. Pink and
 * Prism are encoded by absence when off, so a restore must *set* each mode from
 * the entry, not flip it from whatever is on screen or resolve it from the
 * stored preference.
 */
async function expectLook(
  page: import("@playwright/test").Page,
  look: { pink: boolean; prism: boolean },
) {
  await expect(page.locator("#btn-pink")).toHaveAttribute("aria-pressed", String(look.pink));
  await expect(page.locator("#btn-prism")).toHaveAttribute("aria-pressed", String(look.prism));
  const body = page.locator("body");
  if (look.pink) await expect(body).toHaveClass(/pink-mode/);
  else await expect(body).not.toHaveClass(/pink-mode/);
  if (look.prism) await expect(body).toHaveClass(/prism-mode/);
  else await expect(body).not.toHaveClass(/prism-mode/);
}

test("Back keeps Pink on: grow with Pink on, then goBack", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await expectSeed(page, "abcde");

  await page.locator("#btn-pink").click();
  await expect(page.locator("#btn-pink")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#refresh").click();
  await expect(page.locator("#seed-display")).not.toHaveText("abcde", { ignoreCase: true });

  await page.goBack();
  await expectSeed(page, "abcde");
  await expect(page.locator("#btn-pink")).toHaveAttribute("aria-pressed", "true");
});

test("Back and Forward keep both Pink and Prism on with the right seeds", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await expectSeed(page, "abcde");
  await page.locator("#btn-pink").click();
  await page.locator("#btn-prism").click();
  await expectLook(page, { pink: true, prism: true });

  await page.locator("#refresh").click();
  const second = await currentSeed(page);
  expect(second).not.toBe("abcde");

  await page.goBack();
  await expectSeed(page, "abcde");
  await expectLook(page, { pink: true, prism: true });

  // The restore must not have rewritten the entry's look: Forward and Back
  // again land in the same place.
  await page.goForward();
  await expectSeed(page, second);
  await expectLook(page, { pink: true, prism: true });
  await page.goBack();
  await expectSeed(page, "abcde");
  await expectLook(page, { pink: true, prism: true });
});

test("Back to an entry recorded with Pink off turns Pink off even when the stored pref is on", async ({
  page,
}) => {
  await page.goto("/?seed=abcde");
  await expectSeed(page, "abcde");
  await expectLook(page, { pink: false, prism: false });

  await page.locator("#refresh").click();
  await expect(page.locator("#seed-display")).not.toHaveText("abcde", { ignoreCase: true });

  // Something else (another tab) turned the remembered look on. The entry we
  // are about to pop was recorded with Pink off, and that is what it restores.
  await page.evaluate(() => {
    localStorage.setItem(
      "frostbomb-mode-prefs",
      JSON.stringify({ pink: true, prism: true }),
    );
  });

  await page.goBack();
  await expectSeed(page, "abcde");
  await expectLook(page, { pink: false, prism: false });
});

test("Back to an entry recorded with Pink on turns it on when the current look is off", async ({
  page,
}) => {
  await page.goto("/?seed=abcde&pink=1&prism=1");
  await expectSeed(page, "abcde");
  await expectLook(page, { pink: true, prism: true });

  await page.locator("#refresh").click();
  await page.locator("#btn-pink").click();
  await page.locator("#btn-prism").click();
  await expectLook(page, { pink: false, prism: false });

  await page.goBack();
  await expectSeed(page, "abcde");
  await expectLook(page, { pink: true, prism: true });
});

test("a restore announces once, not once per mode", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await expectSeed(page, "abcde");
  await page.locator("#btn-pink").click();
  await page.locator("#btn-prism").click();
  await page.locator("#refresh").click();
  // Turn the look off on the second entry so Back has to change both modes.
  await page.locator("#btn-pink").click();
  await page.locator("#btn-prism").click();
  // The announcer debounces by 50 ms; let the click's own line land before listening.
  await expect(page.locator("#a11y-announcer")).toContainText("Prism mode disabled");

  await page.locator("#a11y-announcer").evaluate((el) => {
    const heard: string[] = [];
    (window as unknown as { __heard: string[] }).__heard = heard;
    new MutationObserver(() => {
      if (el.textContent) heard.push(el.textContent);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });

  await page.goBack();
  await expectSeed(page, "abcde");
  await expectLook(page, { pink: true, prism: true });

  await expect(page.locator("#a11y-announcer")).toContainText("Loaded seed abcde");
  const heard = await page.evaluate(() => (window as unknown as { __heard: string[] }).__heard);
  expect(heard.filter((m) => /Loaded seed/.test(m))).toHaveLength(1);
  expect(heard.filter((m) => /Pink mode|Prism mode/.test(m))).toEqual([]);
});

/**
 * #335 — holding R or Space is one regrow, not one per OS auto-repeat event.
 *
 * Playwright has no OS key repeat: `keyboard.down(key)` sends `repeat: true`
 * only when that key is already down. So the hold is simulated the way a real
 * one arrives: one press, then more `down` calls every ~30 ms for ~500 ms.
 */
async function recentSeeds(page: import("@playwright/test").Page) {
  return page.locator("#recent-seeds-list button.seed-pill").allTextContents();
}

for (const [label, key] of [
  ["R", "r"],
  ["Space", "Space"],
] as const) {
  test(`holding ${label} for 500 ms grows one crystal, one history entry, one Recent Seed`, async ({
    page,
  }) => {
    await page.goto("/?seed=abcde");
    await expectSeed(page, "abcde");
    await expect(page.locator("#recent-seeds-list button.seed-pill")).toHaveCount(1);

    const historyBefore = await page.evaluate(() => window.history.length);
    const recentBefore = await recentSeeds(page);
    expect(recentBefore).toEqual(["abcde"]);

    // Runs after the app's own window listener, so `defaultPrevented` reflects it.
    await page.evaluate(() => {
      const seen = { total: 0, repeats: 0, prevented: 0 };
      (window as unknown as { __keydowns: typeof seen }).__keydowns = seen;
      window.addEventListener("keydown", (e) => {
        seen.total++;
        if (e.repeat) seen.repeats++;
        if (e.defaultPrevented) seen.prevented++;
      });
    });

    await page.keyboard.down(key);
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(30);
      await page.keyboard.down(key);
    }
    await page.keyboard.up(key);

    // Guard against a vacuous pass: the page really did receive auto-repeats.
    const seen = await page.evaluate(
      () =>
        (window as unknown as { __keydowns: Record<"total" | "repeats" | "prevented", number> })
          .__keydowns,
    );
    expect(seen.total).toBe(16);
    expect(seen.repeats).toBe(15);
    // A held Space must not scroll the page either: every event is prevented.
    if (key === "Space") expect(seen.prevented).toBe(16);

    const second = await currentSeed(page);
    expect(second).not.toBe("abcde");
    expect(await page.evaluate(() => window.history.length)).toBe(historyBefore + 1);
    // Recent Seeds gained exactly the one new crystal; the earlier one survives.
    expect(await recentSeeds(page)).toEqual([second, "abcde"]);

    // ...so one Back step returns to the crystal that was on screen before the hold.
    await page.goBack();
    await expectSeed(page, "abcde");
  });
}

/**
 * #379 — hash-only history (Skip to controls) must not re-restore the crystal
 * when the query string is unchanged.
 */
async function activateSkipLink(page: import("@playwright/test").Page) {
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#field-notes")).toBeFocused();
  await page.waitForFunction(() => location.hash === "#field-notes");
}

async function startLoadedSeedWatch(page: import("@playwright/test").Page) {
  await page.locator("#a11y-announcer").evaluate((el) => {
    const heard: string[] = [];
    (window as unknown as { __heard: string[] }).__heard = heard;
    new MutationObserver(() => {
      if (el.textContent) heard.push(el.textContent);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
}

async function expectNoLoadedSeedAfterHashBack(page: import("@playwright/test").Page) {
  const searchBeforeSkip = await page.evaluate(() => location.search);
  await startLoadedSeedWatch(page);
  await activateSkipLink(page);
  expect(await page.evaluate(() => location.search)).toBe(searchBeforeSkip);
  await page.goBack();
  await page.waitForFunction(() => location.hash === "");
  await page.waitForTimeout(300);
  const heard = await page.evaluate(() => (window as unknown as { __heard: string[] }).__heard);
  expect(heard.filter((m) => /Loaded seed/.test(m))).toEqual([]);
  expect(await page.evaluate(() => location.search)).toBe(searchBeforeSkip);
}

test.describe("#379 hash-only Back after Skip to controls", () => {
  test("bare ?seed=abcde does not re-announce Loaded seed", async ({ page }) => {
    await page.goto("/?seed=abcde");
    await expectSeed(page, "abcde");
    await expectNoLoadedSeedAfterHashBack(page);
    await expectSeed(page, "abcde");
  });

  test("?seed=abcde&rotate=1 does not re-announce Loaded seed", async ({ page }) => {
    await page.goto("/?seed=abcde&rotate=1");
    await expectSeed(page, "abcde");
    await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "true");
    await expectNoLoadedSeedAfterHashBack(page);
    await expectSeed(page, "abcde");
    await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "true");
  });

  test("?seed=abcde&rotate=1 with reduced motion does not re-announce Loaded seed", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?seed=abcde&rotate=1");
    await expectSeed(page, "abcde");
    await expect(page.locator("#btn-rotate")).toHaveAttribute("aria-pressed", "false");
    await expectNoLoadedSeedAfterHashBack(page);
    await expectSeed(page, "abcde");
  });

  test("remembered Pink stays on and does not re-announce Loaded seed", async ({ page }) => {
    await page.goto("/?seed=abcde");
    await page.locator("#btn-pink").click();
    await expect(page.locator("#btn-pink")).toHaveAttribute("aria-pressed", "true");
    await page.goto("/?seed=abcde");
    await expectSeed(page, "abcde");
    await expect(page.locator("#btn-pink")).toHaveAttribute("aria-pressed", "true");
    await expectNoLoadedSeedAfterHashBack(page);
    await expectSeed(page, "abcde");
    await expect(page.locator("#btn-pink")).toHaveAttribute("aria-pressed", "true");
  });
});
