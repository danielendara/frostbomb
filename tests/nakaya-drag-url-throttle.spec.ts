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

  // On screen, so the real mouse down/up land on the canvas (pointerup flushes).
  await page.locator("#nakaya-diagram").scrollIntoViewIfNeeded();
  const box = await page.locator("#nakaya-diagram").boundingBox();
  if (!box) throw new Error("no diagram box");

  await page.evaluate(() => {
    (window as unknown as { __replaceCount: number }).__replaceCount = 0;
  });
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  // A 200-step drag on a fixed 2 s schedule (one step per 10 ms), dispatched
  // in-page. Steps that fall due while a slow regrow blocks the main thread are
  // delivered together in the next task, the way a busy browser delivers
  // pointer input late, so a slow CI regrow can't stretch the drag into many
  // more tasks than the schedule allows.
  const elapsed = await page.evaluate(
    ({ x, y, w, h }) =>
      new Promise<number>((resolve) => {
        const canvas = document.getElementById("nakaya-diagram")!;
        const MOVES = 200;
        const STEP_MS = 10;
        const start = performance.now();
        let i = 0;
        const tick = () => {
          const due = Math.min(MOVES, Math.floor((performance.now() - start) / STEP_MS) + 1);
          for (; i < due; i++) {
            const f = 0.2 + (0.6 * (i + 1)) / MOVES;
            canvas.dispatchEvent(
              new PointerEvent("pointermove", {
                clientX: x + w * f,
                clientY: y + h * f,
                buttons: 1,
                bubbles: true,
              }),
            );
          }
          if (i < MOVES) setTimeout(tick, Math.max(0, start + i * STEP_MS - performance.now()));
          else resolve(performance.now() - start);
        };
        tick();
      }),
    { x: box.x, y: box.y, w: box.width, h: box.height },
  );
  await page.mouse.up();

  const count = await page.evaluate(() => (window as unknown as { __replaceCount: number }).__replaceCount);
  // The throttle bounds writes by time (>= 150 ms apart), not by move count:
  // 200 moves must never mean anywhere near 200 writes.
  expect(count).toBeLessThanOrEqual(Math.floor(elapsed / 150) + 2);
  expect(count).toBeLessThanOrEqual(30);

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
  // The entry Back returns to holds the final drag point (f = 0.7), not an earlier one.
  expectDragPoint(backParams, 0.7);
});

test("pressing R mid-drag keeps the final drag point on the Back entry", async ({ page }) => {
  await page.goto("/?seed=abcde");
  await page.click("#guide-toggle");
  await expect(page.locator("#field-guide")).toBeVisible();
  await page.click("#lab-toggle");
  await expect(page.locator("#lab-status")).toHaveText("ON");

  const box = await page.locator("#nakaya-diagram").boundingBox();
  if (!box) throw new Error("no diagram box");

  // Moves and R in one task: the drag's trailing write is still pending when
  // the Regrow push runs, so only a flush before the push can land it.
  const { len, pendingT } = await page.evaluate(
    ({ x, y, w, h }) => {
      const canvas = document.getElementById("nakaya-diagram")!;
      const len = history.length;
      for (const f of [0.3, 0.4, 0.5, 0.6, 0.7]) {
        canvas.dispatchEvent(
          new PointerEvent("pointermove", { clientX: x + w * f, clientY: y + h * f, buttons: 1, bubbles: true }),
        );
      }
      const pendingT = new URL(location.href).searchParams.get("t");
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true }));
      return { len, pendingT };
    },
    { x: box.x, y: box.y, w: box.width, h: box.height },
  );
  // The final point had not reached the URL yet when R was pressed.
  expect(Number(pendingT)).not.toBeCloseTo(0.7 * 40 - 40, 0);
  expect(await page.evaluate(() => history.length)).toBe(len + 1);
  const regrownSeed = new URL(page.url()).searchParams.get("seed");

  await page.goBack();
  const backParams = new URL(page.url()).searchParams;
  expect(backParams.get("seed")).not.toBe(regrownSeed);
  expectDragPoint(backParams, 0.7);
});

/** Diagram fraction f on both axes maps to t = 40f - 40 (°C) and ss = 100(1 - f) (%). */
function expectDragPoint(params: URLSearchParams, f: number) {
  expect(Number(params.get("t"))).toBeCloseTo(f * 40 - 40, 0);
  expect(Math.abs(Number(params.get("ss")) - (1 - f) * 100)).toBeLessThanOrEqual(1);
}
