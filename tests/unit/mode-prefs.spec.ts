/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  effectiveRotateFlag,
  loadModePrefs,
  resolveRotatePref,
  saveModePrefs,
  MODE_PREFS_KEY,
} from "../../src/mode-prefs";

describe("resolveRotatePref", () => {
  it("prefers the ?rotate= value, then stored, then true when motion is allowed", () => {
    expect(resolveRotatePref(false, true, false)).toBe(false);
    expect(resolveRotatePref(true, false, false)).toBe(true);
    expect(resolveRotatePref(null, false, false)).toBe(false);
    expect(resolveRotatePref(null, true, false)).toBe(true);
    expect(resolveRotatePref(null, undefined, false)).toBe(true);
  });

  it("uses only the stored value (maybe undefined) under reduced motion", () => {
    expect(resolveRotatePref(true, undefined, true)).toBeUndefined();
    expect(resolveRotatePref(null, undefined, true)).toBeUndefined();
    expect(resolveRotatePref(true, false, true)).toBe(false);
    expect(resolveRotatePref(null, true, true)).toBe(true);
  });
});

describe("effectiveRotateFlag", () => {
  it.each([
    [true, false, true],
    [true, true, null],
    [false, false, false],
    [false, true, false],
    [undefined, false, null],
    [undefined, true, null],
  ] as const)("pref=%s reducedMotion=%s -> %s", (pref, reduced, expected) => {
    expect(effectiveRotateFlag(pref, reduced)).toBe(expected);
  });
});

describe("mode prefs read/write", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("defaults to all modes off when storage is empty", () => {
    expect(loadModePrefs()).toEqual({
      pink: false,
      prism: false,
      lab: undefined,
      rotate: undefined,
      glow: undefined,
    });
  });

  it("round-trips glow through localStorage", () => {
    saveModePrefs({ pink: false, prism: false, glow: true });
    expect(loadModePrefs().glow).toBe(true);
  });

  it("treats non-boolean glow values as unset", () => {
    localStorage.setItem(MODE_PREFS_KEY, JSON.stringify({ glow: "yes" }));
    expect(loadModePrefs().glow).toBeUndefined();
  });

  it("falls back to glow unset when storage is corrupt", () => {
    localStorage.setItem(MODE_PREFS_KEY, "not-json");
    expect(loadModePrefs().glow).toBeUndefined();
  });

  it("round-trips lab=true through localStorage", () => {
    localStorage.setItem(MODE_PREFS_KEY, JSON.stringify({ lab: "yes" }));
    expect(loadModePrefs().lab).toBeUndefined();
  });

  it("falls back to lab unset when storage is corrupt", () => {
    localStorage.setItem(MODE_PREFS_KEY, "not-json");
    expect(loadModePrefs().lab).toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it("preserves existing pink/prism/rotate fields when lab is added", () => {
    saveModePrefs({ pink: true, prism: true, lab: true, rotate: false });
    expect(loadModePrefs()).toEqual({
      pink: true,
      prism: true,
      lab: true,
      rotate: false,
    });
  });
});
