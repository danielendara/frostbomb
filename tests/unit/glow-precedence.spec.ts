import { describe, expect, it } from "vitest";
import { resolveGlow } from "../../src/url-state";
import { GLOW_MODE } from "../../src/ui/mode-toggle";

const params = (query: string) => new URLSearchParams(query);
const defaultOn = GLOW_MODE.defaultEnabled;

describe("resolveGlow", () => {
  describe("boot", () => {
    it("plain visit uses stored then default", () => {
      expect(resolveGlow("boot", params(""), undefined, defaultOn)).toBe(defaultOn);
      expect(resolveGlow("boot", params(""), true, defaultOn)).toBe(true);
      expect(resolveGlow("boot", params(""), false, defaultOn)).toBe(false);
    });

    it("share link param beats stored either way", () => {
      expect(resolveGlow("boot", params("seed=abcde&glow=1"), false, defaultOn)).toBe(true);
      expect(resolveGlow("boot", params("seed=abcde&glow=0"), true, defaultOn)).toBe(false);
    });

    it("old share link without glow opens off even when stored on", () => {
      expect(resolveGlow("boot", params("seed=abcde"), true, defaultOn)).toBe(false);
    });

    it("reads glow=1/0/x via parse tri-state", () => {
      expect(resolveGlow("boot", params("pink=1&glow=1"), undefined, defaultOn)).toBe(true);
      expect(resolveGlow("boot", params("pink=1&glow=0"), true, defaultOn)).toBe(false);
      expect(resolveGlow("boot", params("pink=1&glow=x"), true, defaultOn)).toBe(false);
    });
  });

  describe("restore", () => {
    it("present param decides; absent means off", () => {
      expect(resolveGlow("restore", params("seed=abcde&glow=1"), false, defaultOn)).toBe(true);
      expect(resolveGlow("restore", params("seed=abcde&glow=0"), true, defaultOn)).toBe(false);
      expect(resolveGlow("restore", params("seed=abcde"), true, defaultOn)).toBe(false);
    });
  });
});
