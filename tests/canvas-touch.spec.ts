import { test, expect } from "@playwright/test";

test.use({ hasTouch: true });

type DragState = { isDragging: boolean; x: number; y: number };

const readDrag = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as any).__FROSTBOMB_DRAG__() as DragState);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof (window as any).__FROSTBOMB_DRAG__ === "function");
});

test("#scene allows only pinch-zoom touch gestures", async ({ page }) => {
  const touchAction = await page
    .locator("#scene")
    .evaluate((el) => getComputedStyle(el).touchAction);
  expect(touchAction).toBe("pinch-zoom");
});

test("pointercancel stops the drag and later moves do not rotate", async ({ page }) => {
  const before = await page.evaluate(() => {
    const canvas = document.querySelector("#scene") as HTMLCanvasElement;
    const init = { pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true };
    canvas.dispatchEvent(new PointerEvent("pointerdown", { ...init, clientX: 100, clientY: 100 }));
    return canvas.style.cursor;
  });
  expect(before).toBe("grabbing");

  const after = await page.evaluate(() => {
    const canvas = document.querySelector("#scene") as HTMLCanvasElement;
    const init = { pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true };
    window.dispatchEvent(new PointerEvent("pointercancel", init));
    return canvas.style.cursor;
  });
  expect(after).toBe("grab");

  const rotationBefore = await readDrag(page);
  await page.evaluate(() => {
    const init = { pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true };
    window.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: 200, clientY: 180 }));
  });
  const rotationAfter = await readDrag(page);
  expect(rotationAfter.isDragging).toBe(false);
  expect(rotationAfter.x).toBe(rotationBefore.x);
  expect(rotationAfter.y).toBe(rotationBefore.y);
});

test("a second pointer does not move the drag", async ({ page }) => {
  await page.evaluate(() => {
    const canvas = document.querySelector("#scene") as HTMLCanvasElement;
    canvas.dispatchEvent(
      new PointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100, bubbles: true }),
    );
  });
  const start = await readDrag(page);
  await page.evaluate(() => {
    window.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 2, clientX: 300, clientY: 300, bubbles: true }),
    );
  });
  const end = await readDrag(page);
  expect(end.x).toBe(start.x);
  expect(end.y).toBe(start.y);
});

test("the same pointer pressing again restarts the drag from the new position", async ({ page }) => {
  await page.evaluate(() => {
    const canvas = document.querySelector("#scene") as HTMLCanvasElement;
    const down = (x: number, y: number) =>
      canvas.dispatchEvent(
        new PointerEvent("pointerdown", { pointerId: 1, clientX: x, clientY: y, bubbles: true }),
      );
    down(100, 100);
    down(300, 300);
  });
  const start = await readDrag(page);
  await page.evaluate(() => {
    window.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 1, clientX: 310, clientY: 320, bubbles: true }),
    );
  });
  const end = await readDrag(page);
  expect(end.y - start.y).toBeCloseTo(0.1, 5);
  expect(end.x - start.x).toBeCloseTo(0.2, 5);
});

test("a touch drag across the canvas rotates the crystal", async ({ page }) => {
  const size = page.viewportSize()!;
  const cx = Math.round(size.width / 2);
  const cy = Math.round(size.height / 2);
  const before = await readDrag(page);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: cx - 40, y: cy }],
  });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: cx - 40 + i * 10, y: cy + i * 4 }],
    });
  }
  const during = await readDrag(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  expect(during.isDragging).toBe(true);
  expect(during.y).toBeGreaterThan(before.y);
  expect(during.x).toBeGreaterThan(before.x);
  expect((await readDrag(page)).isDragging).toBe(false);
});
