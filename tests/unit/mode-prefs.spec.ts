import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadModePrefs, saveModePrefs, MODE_PREFS_KEY } from "../../src/mode-prefs";

describe("mode prefs read/write (#312)", () => {
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
    });
  });

  it("round-trips lab=true through localStorage", () => {
    saveModePrefs({ pink: false, prism: false, lab: true, rotate: undefined });
    expect(loadModePrefs().lab).toBe(true);
  });

  it("treats non-boolean lab values as unset", () => {
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
