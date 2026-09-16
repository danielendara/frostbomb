import { describe, expect, it } from "vitest";
import {
  crystalStatesEqual,
  parseCrystalUrlState,
  setLabConditionsParams,
  type CrystalUrlState,
} from "../../src/url-state";

const EMPTY_MODES = { pink: null, prism: null, lab: null, rotate: null };

describe("parseCrystalUrlState", () => {
  it("reads a full share URL", () => {
    expect(parseCrystalUrlState("?seed=ab12x&t=-12.5&ss=80&pink=1&prism=1&lab=1&rotate=0")).toEqual({
      seed: "ab12x",
      lab: { temperatureC: -12.5, supersaturation: 0.8 },
      modes: { pink: true, prism: true, lab: true, rotate: false },
    });
  });

  it("lowercases the seed and rejects unusable ones", () => {
    expect(parseCrystalUrlState("?seed=AB12X").seed).toBe("ab12x");
    for (const raw of ["", "ab", "way-too-long-seed", "ab_12", "ab 12"]) {
      expect(parseCrystalUrlState(`?seed=${encodeURIComponent(raw)}`).seed).toBeNull();
    }
  });

  it("drops out-of-range or unparsable Lab conditions", () => {
    for (const query of ["?t=-12.5", "?ss=80", "?t=abc&ss=80", "?t=-12.5&ss=oops", "?t=5&ss=80", "?t=-41&ss=80", "?t=-12.5&ss=101"]) {
      expect(parseCrystalUrlState(query).lab).toBeNull();
    }
  });

  it("treats an absent mode param as 'no opinion' and a non-1 value as off", () => {
    expect(parseCrystalUrlState("").modes).toEqual(EMPTY_MODES);
    expect(parseCrystalUrlState("?pink=0&prism=yes&lab=1").modes).toMatchObject({
      pink: false,
      prism: false,
      lab: true,
      rotate: null,
    });
  });

  it("survives a foreign / junk query string instead of throwing", () => {
    expect(parseCrystalUrlState("?%%%&seed=ab12x")).toMatchObject({ seed: "ab12x" });
    expect(parseCrystalUrlState("?utm_source=elsewhere")).toEqual({
      seed: null,
      lab: null,
      modes: EMPTY_MODES,
    });
  });
});

describe("round-trip", () => {
  it("re-parses what it serializes, at URL precision", () => {
    const params = new URLSearchParams();
    params.set("seed", "ab12x");
    setLabConditionsParams(params, { temperatureC: -12.54, supersaturation: 0.804 });
    const parsed = parseCrystalUrlState(`?${params.toString()}`);
    expect(parsed.seed).toBe("ab12x");
    expect(parsed.lab).toEqual({ temperatureC: -12.5, supersaturation: 0.8 });
  });
});

describe("crystalStatesEqual", () => {
  const base: CrystalUrlState = {
    seed: "ab12x",
    lab: { temperatureC: -12.5, supersaturation: 0.8 },
    modes: { pink: true, prism: false, lab: true, rotate: false },
  };

  it("is true for the same crystal and look — a popped entry that matches is a no-op", () => {
    expect(crystalStatesEqual(base, { ...base, lab: { ...base.lab! } })).toBe(true);
  });

  it("ignores differences below URL precision", () => {
    expect(
      crystalStatesEqual(base, { ...base, lab: { temperatureC: -12.501, supersaturation: 0.8004 } }),
    ).toBe(true);
  });

  it("is false when the seed, the conditions, or a look mode differ", () => {
    expect(crystalStatesEqual(base, { ...base, seed: "zz99y" })).toBe(false);
    expect(crystalStatesEqual(base, { ...base, lab: { temperatureC: -2, supersaturation: 0.8 } })).toBe(false);
    expect(crystalStatesEqual(base, { ...base, lab: null })).toBe(false);
    expect(crystalStatesEqual(base, { ...base, modes: { ...base.modes, prism: true } })).toBe(false);
  });
});
