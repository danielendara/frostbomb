import { describe, expect, it } from "vitest";
import {
  crystalStatesEqual,
  parseCrystalUrlState,
  quantizeLabConditions,
  resolveModes,
  retainedLabConditions,
  setLabConditionsParams,
  writeCrystalGeneration,
  type CrystalUrlState,
} from "../../src/url-state";

const EMPTY_MODES = { pink: null, prism: null, lab: null, rotate: null };

describe("parseCrystalUrlState", () => {
  it("reads a full share URL", () => {
    expect(parseCrystalUrlState("?seed=ab12x&t=-12.5&ss=80&pink=1&prism=1&lab=1&rotate=0")).toEqual({
      seed: "ab12x",
      provenance: "manual",
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
      provenance: "sampled",
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
    provenance: "manual",
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

  it("is false when the seed, the conditions, the provenance, or a look mode differ", () => {
    expect(crystalStatesEqual(base, { ...base, seed: "zz99y" })).toBe(false);
    expect(crystalStatesEqual(base, { ...base, lab: { temperatureC: -2, supersaturation: 0.8 } })).toBe(false);
    expect(crystalStatesEqual(base, { ...base, lab: null, provenance: "sampled" })).toBe(false);
    expect(crystalStatesEqual(base, { ...base, provenance: "sampled" })).toBe(false);
    expect(crystalStatesEqual(base, { ...base, modes: { ...base.modes, prism: true } })).toBe(false);
  });

  it("treats an absent mode param as off, matching the on-screen all-off state", () => {
    const parsed = parseCrystalUrlState("?seed=abcde");
    const onScreen: CrystalUrlState = {
      seed: "abcde",
      provenance: "sampled",
      lab: null,
      modes: { pink: false, prism: false, lab: false, rotate: false },
    };
    expect(crystalStatesEqual(parsed, onScreen)).toBe(true);
  });

  it("ignores rotate when it is absent from the popped URL", () => {
    const parsed = parseCrystalUrlState("?seed=abcde");
    const onScreen: CrystalUrlState = {
      seed: "abcde",
      provenance: "sampled",
      lab: null,
      modes: { pink: false, prism: false, lab: false, rotate: true },
    };
    expect(crystalStatesEqual(parsed, onScreen)).toBe(true);
  });

  it("compares rotate when it is present in the URL", () => {
    const parsed = parseCrystalUrlState("?seed=abcde&rotate=1");
    const onScreen: CrystalUrlState = {
      seed: "abcde",
      provenance: "sampled",
      lab: null,
      modes: { pink: false, prism: false, lab: false, rotate: false },
    };
    expect(crystalStatesEqual(parsed, onScreen)).toBe(false);
    expect(
      crystalStatesEqual(parsed, {
        ...onScreen,
        modes: { ...onScreen.modes, rotate: true },
      }),
    ).toBe(true);
  });

  it("ignores rotate under reduced motion when it is present in the URL", () => {
    const parsed = parseCrystalUrlState("?seed=abcde&rotate=1");
    const onScreen: CrystalUrlState = {
      seed: "abcde",
      provenance: "sampled",
      lab: null,
      modes: { pink: false, prism: false, lab: false, rotate: false },
    };
    expect(crystalStatesEqual(parsed, onScreen, { reducedMotion: true })).toBe(true);
  });

  it("is false when an explicit on differs from an absent (off) mode", () => {
    const parsed = parseCrystalUrlState("?seed=abcde");
    const onScreen: CrystalUrlState = {
      seed: "abcde",
      provenance: "sampled",
      lab: null,
      modes: { pink: true, prism: false, lab: false, rotate: false },
    };
    expect(crystalStatesEqual(parsed, onScreen)).toBe(false);
  });
});

describe("generation provenance (#341)", () => {
  it("treats a seed-only link as sampled and an explicit t/ss pair as manual", () => {
    expect(parseCrystalUrlState("?seed=abcde")).toMatchObject({
      seed: "abcde",
      provenance: "sampled",
      lab: null,
    });
    expect(parseCrystalUrlState("?seed=abcde&t=-12.9&ss=92")).toMatchObject({
      provenance: "manual",
      lab: { temperatureC: -12.9, supersaturation: 0.92 },
    });
  });

  it("omits t/ss for a sampled crystal even if a condition pair is passed", () => {
    const params = new URLSearchParams("seed=abcde&t=-12.9&ss=92&pink=1");
    writeCrystalGeneration(params, "sampled", { temperatureC: -12.9, supersaturation: 0.92 });
    expect(params.get("t")).toBeNull();
    expect(params.get("ss")).toBeNull();
    expect(params.get("seed")).toBe("abcde");
    expect(params.get("pink")).toBe("1");
    expect(parseCrystalUrlState(`?${params.toString()}`).provenance).toBe("sampled");
  });

  it("writes a manual fixed point at URL precision and parses it back as manual", () => {
    const params = new URLSearchParams("seed=abcde");
    writeCrystalGeneration(params, "manual", { temperatureC: -12.54, supersaturation: 0.804 });
    expect(params.get("t")).toBe("-12.5");
    expect(params.get("ss")).toBe("80");
    expect(parseCrystalUrlState(`?${params.toString()}`)).toMatchObject({
      provenance: "manual",
      lab: { temperatureC: -12.5, supersaturation: 0.8 },
    });
  });

  it("quantizes at the 0.1 °C and whole-percent boundaries", () => {
    expect(quantizeLabConditions({ temperatureC: -12.54, supersaturation: 0.804 })).toEqual({
      temperatureC: -12.5,
      supersaturation: 0.8,
    });
    expect(quantizeLabConditions({ temperatureC: -12.55, supersaturation: 0.805 })).toEqual({
      temperatureC: -12.6,
      supersaturation: 0.81,
    });
    expect(quantizeLabConditions({ temperatureC: -39.95, supersaturation: 0.995 })).toEqual({
      temperatureC: -40,
      supersaturation: 1,
    });
    expect(quantizeLabConditions({ temperatureC: -0.04, supersaturation: 0 })).toEqual({
      temperatureC: -0,
      supersaturation: 0,
    });
  });

  it("keeps a manual point across a seed change and drops a sampled one", () => {
    expect(
      retainedLabConditions("manual", { temperatureC: -15.04, supersaturation: 0.604 }),
    ).toEqual({ temperatureC: -15, supersaturation: 0.6 });
    expect(
      retainedLabConditions("sampled", { temperatureC: -15, supersaturation: 0.6 }),
    ).toBeNull();
    expect(retainedLabConditions("manual", null)).toBeNull();
  });
});

describe("resolveModes (#331)", () => {
  const off = { pink: false, prism: false };
  const on = { pink: true, prism: true };
  const params = (query: string) => new URLSearchParams(query);

  describe("boot: URL wins when present, stored prefs apply when absent", () => {
    it("uses the stored preference when the params are absent", () => {
      expect(resolveModes("boot", params(""), on)).toEqual(on);
      expect(resolveModes("boot", params(""), off)).toEqual(off);
      expect(resolveModes("boot", params("seed=abcde"), { pink: true, prism: false })).toEqual({
        pink: true,
        prism: false,
      });
    });

    it("lets a present param beat the stored preference, either way", () => {
      expect(resolveModes("boot", params("pink=1&prism=1"), off)).toEqual(on);
      expect(resolveModes("boot", params("pink=0&prism=0"), on)).toEqual(off);
    });

    it("resolves each mode independently", () => {
      expect(resolveModes("boot", params("pink=1"), { pink: false, prism: true })).toEqual(on);
      expect(resolveModes("boot", params("prism=1"), { pink: true, prism: false })).toEqual(on);
    });

    it("reads a present non-1 value as off, over a stored on", () => {
      expect(resolveModes("boot", params("pink=yes&prism="), on)).toEqual(off);
    });
  });

  describe("restore: the popped entry is authoritative", () => {
    it("treats an absent param as off even when the stored preference is on", () => {
      expect(resolveModes("restore", params("seed=abcde"), on)).toEqual(off);
      expect(resolveModes("restore", params(""), on)).toEqual(off);
    });

    it("keeps a present =1 on, whatever the stored preference says", () => {
      expect(resolveModes("restore", params("pink=1&prism=1"), off)).toEqual(on);
      expect(resolveModes("restore", params("pink=1&prism=1"), on)).toEqual(on);
    });

    it("keeps a present non-1 value off", () => {
      expect(resolveModes("restore", params("pink=0&prism=0"), on)).toEqual(off);
    });

    it("resolves each mode independently", () => {
      expect(resolveModes("restore", params("pink=1"), on)).toEqual({ pink: true, prism: false });
      expect(resolveModes("restore", params("prism=1"), on)).toEqual({ pink: false, prism: true });
    });
  });

  it("agrees with parseCrystalUrlState on what a present param means", () => {
    for (const query of ["?pink=1&prism=0", "?pink=0&prism=1", "?pink=x&prism=1"]) {
      const { modes } = parseCrystalUrlState(query);
      for (const source of ["boot", "restore"] as const) {
        expect(resolveModes(source, params(query), on)).toEqual({
          pink: modes.pink,
          prism: modes.prism,
        });
      }
    }
  });
});
