import { describe, expect, it, beforeEach } from "vitest";
import {
  MARK_FIRST_FLAKE_BUILT,
  MARK_FIRST_FRAME_RENDERED,
  MARK_POSTPROCESSING_READY,
  hasMark,
  markOnce,
  resetPerfMarksForTests,
} from "../../src/snowflake/perf-marks";

describe("startup performance marks", () => {
  beforeEach(() => {
    resetPerfMarksForTests();
  });

  it("records each mark and measure only once, without timing thresholds", () => {
    markOnce(MARK_FIRST_FLAKE_BUILT);
    markOnce(MARK_FIRST_FLAKE_BUILT);

    expect(hasMark(MARK_FIRST_FLAKE_BUILT)).toBe(true);
    expect(performance.getEntriesByName(MARK_FIRST_FLAKE_BUILT, "mark")).toHaveLength(1);
    expect(
      performance.getEntriesByName(`${MARK_FIRST_FLAKE_BUILT}:since-nav`, "measure"),
    ).toHaveLength(1);
  });

  it("exposes the three audit mark names", () => {
    expect(MARK_FIRST_FLAKE_BUILT).toBe("frostbomb:first-flake-built");
    expect(MARK_FIRST_FRAME_RENDERED).toBe("frostbomb:first-frame-rendered");
    expect(MARK_POSTPROCESSING_READY).toBe("frostbomb:postprocessing-ready");
  });
});
