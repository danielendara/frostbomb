/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { PHOTO_ICE_BY_TIER } from "../../src/snowflake/ice-material";

describe("photographic ice material table", () => {
  it("RICH uses full transmission, dispersion and subtle iridescence", () => {
    expect(PHOTO_ICE_BY_TIER.rich).toMatchObject({
      transmission: 1,
      dispersion: 0.3,
      iridescence: 0.35,
      clearcoat: 0.5,
      roughness: 0.08,
      attenuationColor: "#88ccff",
      ior: 1.31,
    });
  });

  it("LITE drops transmission, dispersion and iridescence", () => {
    expect(PHOTO_ICE_BY_TIER.lite).toMatchObject({
      transmission: 0,
      dispersion: 0,
      iridescence: 0,
      clearcoat: 0.55,
      roughness: 0.08,
    });
  });
});
