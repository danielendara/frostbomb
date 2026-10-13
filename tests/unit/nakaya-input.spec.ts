import { describe, expect, it } from "vitest";
import { NAKAYA_NAV_KEYS, nakayaKeyStep, nakayaPointToConditions } from "../../src/ui/nakaya-input";
import { parseCrystalUrlState } from "../../src/url-state";

const rect = { left: 10, top: 20, width: 200, height: 100 };
const at = (temperature: number, supersaturation: number) => ({ temperature, supersaturation });

describe("nakayaPointToConditions", () => {
  it("maps corners and centre", () => {
    expect(nakayaPointToConditions(10, 20, rect)).toEqual({ temperatureC: -40, ss: 1 });
    expect(nakayaPointToConditions(210, 20, rect)).toEqual({ temperatureC: 0, ss: 1 });
    expect(nakayaPointToConditions(10, 120, rect)).toEqual({ temperatureC: -40, ss: 0 });
    expect(nakayaPointToConditions(210, 120, rect)).toEqual({ temperatureC: 0, ss: 0 });
    expect(nakayaPointToConditions(110, 70, rect)).toEqual({ temperatureC: -20, ss: 0.5 });
  });

  it("clamps pointers outside the rect", () => {
    expect(nakayaPointToConditions(-500, -500, rect)).toEqual({ temperatureC: -40, ss: 1 });
    expect(nakayaPointToConditions(900, 900, rect)).toEqual({ temperatureC: 0, ss: 0 });
  });
});

describe("nakayaKeyStep", () => {
  const cases: [string, boolean, [number, number], [number, number]][] = [
    ["ArrowLeft", false, [-15, 60], [-16, 60]],
    ["ArrowLeft", true, [-15, 60], [-18, 60]],
    ["ArrowRight", false, [-15, 60], [-14, 60]],
    ["ArrowRight", true, [-15, 60], [-12, 60]],
    ["ArrowUp", false, [-15, 60], [-15, 65]],
    ["ArrowUp", true, [-15, 60], [-15, 75]],
    ["ArrowDown", false, [-15, 60], [-15, 55]],
    ["ArrowDown", true, [-15, 60], [-15, 45]],
    ["Home", false, [-15, 60], [-40, 60]],
    ["Home", true, [-15, 60], [-40, 60]],
    ["End", false, [-15, 60], [0, 60]],
    ["End", true, [-15, 60], [0, 60]],
    ["PageUp", false, [-15, 60], [-15, 85]],
    ["PageUp", true, [-15, 60], [-15, 85]],
    ["PageDown", false, [-15, 60], [-15, 35]],
    ["PageDown", true, [-15, 60], [-15, 35]],
  ];
  it.each(cases)("%s shift=%s", (key, shift, from, to) => {
    expect(nakayaKeyStep(key, shift, at(...from))).toEqual(at(...to));
  });

  it("clamps at both ends of both axes", () => {
    expect(nakayaKeyStep("ArrowLeft", true, at(-39, 50))).toEqual(at(-40, 50));
    expect(nakayaKeyStep("ArrowRight", true, at(-1, 50))).toEqual(at(0, 50));
    expect(nakayaKeyStep("ArrowUp", true, at(-10, 95))).toEqual(at(-10, 100));
    expect(nakayaKeyStep("ArrowDown", true, at(-10, 5))).toEqual(at(-10, 0));
    expect(nakayaKeyStep("PageUp", false, at(-10, 90))).toEqual(at(-10, 100));
    expect(nakayaKeyStep("PageDown", false, at(-10, 10))).toEqual(at(-10, 0));
  });

  it("returns null for unhandled keys", () => {
    for (const key of ["a", "Enter", " ", "Tab", "Escape"]) {
      expect(nakayaKeyStep(key, false, at(-10, 50))).toBeNull();
    }
  });

  it("lists exactly the handled keys", () => {
    for (const key of NAKAYA_NAV_KEYS) expect(nakayaKeyStep(key, false, at(-10, 50))).not.toBeNull();
    expect(NAKAYA_NAV_KEYS).toHaveLength(8);
  });

  it("only produces values the share-URL parser accepts", () => {
    for (let t = -40; t <= 0; t += 0.5) {
      for (let ss = 0; ss <= 100; ss += 5) {
        for (const key of NAKAYA_NAV_KEYS) {
          for (const shift of [false, true]) {
            const next = nakayaKeyStep(key, shift, at(t, ss))!;
            const lab = parseCrystalUrlState(
              `?seed=abc123&t=${next.temperature}&ss=${next.supersaturation}`,
            ).lab;
            expect(lab).not.toBeNull();
            expect(lab!.temperatureC).toBe(next.temperature);
          }
        }
      }
    }
  });
});
