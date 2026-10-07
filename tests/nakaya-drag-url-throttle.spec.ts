import { expect, test } from "@playwright/test";

/** #388 — dragging the Nakaya diagram must not call history.replaceState per move. */

test("a Nakaya drag throttles replaceState and lands the final crystal in the URL", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __replaceCount: number };
    w.__replaceCount = 0;
    const orig = history.replaceState.bind(history);
    history.replaceState = (...args: Parameters<History["replaceState"]>) => {
      w.__replaceCount++;
      return orig(...args);
    };
  });
  await page.goto("/?seed=abcde");
  await page.click("#guide-toggle");
  await expect(page.locator("#field-guide")).toBeVisible();
  await page.click("#lab-toggle");
  await expect(page.locator("#lab-status")).toHaveText("ON");

  const box = await page.locator("#nakaya-diagram").boundingBox();
  if (!box) throw new Error("no diagram box");

  await page.evaluate(() => {
    (window as unknown as { __replaceCount: number }).__replaceCount = 0;
  });
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  // 60 pointermoves at 10 ms spacing, dispatched in-page so a slow regrow in CI
  // cannot stretch the drag far beyond its nominal length.
  const elapsed = await page.evaluate(
    ({ x, y, w, h }) =>
      new Promise<number>((resolve) => {
        const canvas = document.getElementById("nakaya-diagram")!;
        const MOVES = 60;
        const start = performance.now();
        let i = 0;
        const tick = () => {
          const f = 0.2 + (0.6 * i) / MOVES;
          canvas.dispatchEvent(
            new PointerEvent("pointermove", {
              clientX: x + w * f,
              clientY: y + h * f,
              buttons: 1,
              bubbles: true,
            }),
          );
          if (++i <= MOVES) setTimeout(tick, 10);
          else resolve(performance.now() - start);
        };
        tick();
      }),
    { x: box.x, y: box.y, w: box.width, h: box.height },
  );
  await page.mouse.up();

  const count = await page.evaluate(() => (window as unknown as { __replaceCount: number }).__replaceCount);
  // Each move regrows the crystal, which is slow without a GPU, so the drag can
  // run far past 2 s. The throttle bounds writes by time (>= 150 ms apart), not
  // by move count: a 2 s drag stays <= 30, a longer one scales with its length.
  expect(count).toBeLessThanOrEqual(Math.floor(elapsed / 150) + 2);
  if (elapsed < 2500) expect(count).toBeLessThanOrEqual(30);

  const params = new URL(page.url()).searchParams;
  const temp = (await page.locator("#stat-temp").innerText()).match(/-?\d+(\.\d+)?/);
  const humid = (await page.locator("#stat-humid").innerText()).match(/\d+(\.\d+)?/);
  expect(temp).not.toBeNull();
  expect(humid).not.toBeNull();
  expect(Number(params.get("t"))).toBeCloseTo(Number(temp![0]), 0);
  expect(Number(params.get("ss"))).toBeCloseTo(Number(humid![0]), 0);
});

test("a habit chip right after a drag still pushes exactly one Back entry", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await page.click("#guide-toggle");
  await expect(page.locator("#field-guide")).toBeVisible();
  await page.click("#lab-toggle");
  await expect(page.locator("#lab-status")).toHaveText("ON");

  const box = await page.locator("#nakaya-diagram").boundingBox();
  if (!box) throw new Error("no diagram box");

  // Moves and the chip click in one task: the drag's trailing write is still pending.
  const before = await page.evaluate(
    ({ x, y, w, h }) => {
      const canvas = document.getElementById("nakaya-diagram")!;
      const len = history.length;
      for (const f of [0.3, 0.5, 0.7]) {
        canvas.dispatchEvent(
          new PointerEvent("pointermove", { clientX: x + w * f, clientY: y + h * f, buttons: 1, bubbles: true }),
        );
      }
      const chip = document.querySelector<HTMLElement>('.habit-chip[aria-pressed="false"]')!;
      chip.click();
      return len;
    },
    { x: box.x, y: box.y, w: box.width, h: box.height },
  );
  const chipParams = new URL(page.url()).searchParams;
  expect(await page.evaluate(() => history.length)).toBe(before + 1);

  await page.goBack();
  const backParams = new URL(page.url()).searchParams;
  expect([backParams.get("t"), backParams.get("ss")]).not.toEqual([chipParams.get("t"), chipParams.get("ss")]);
});
