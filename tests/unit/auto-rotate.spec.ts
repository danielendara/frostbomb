import { describe, expect, it } from "vitest";
import { advanceAutoRotate, INITIAL_AUTO_ROTATE } from "../../src/snowflake/auto-rotate";

describe("advanceAutoRotate", () => {
  it("stays at zero while never enabled", () => {
    let s = INITIAL_AUTO_ROTATE;
    for (let i = 0; i < 100; i++) s = advanceAutoRotate(s, 1 / 60, false);
    expect(s).toEqual({ autoTime: 0, x: 0, y: 0, z: 0 });
  });

  it("holds angles while disabled and continues from them when re-enabled", () => {
    let s = INITIAL_AUTO_ROTATE;
    for (let i = 0; i < 120; i++) s = advanceAutoRotate(s, 1 / 60, true);
    const held = s;
    expect(held.z).toBeGreaterThan(0);
    for (let i = 0; i < 300; i++) s = advanceAutoRotate(s, 1 / 30, false);
    expect(s).toEqual(held);
    const next = advanceAutoRotate(s, 1 / 60, true);
    expect(next.autoTime).toBeCloseTo(held.autoTime + 1 / 60, 10);
    expect(Math.abs(next.z - held.z)).toBeLessThan(0.01);
    expect(Math.abs(next.y - held.y)).toBeLessThan(0.01);
    expect(Math.abs(next.x - held.x)).toBeLessThan(0.01);
  });

  it("does not mutate the input state", () => {
    advanceAutoRotate(INITIAL_AUTO_ROTATE, 1, true);
    expect(INITIAL_AUTO_ROTATE).toEqual({ autoTime: 0, x: 0, y: 0, z: 0 });
  });
});
