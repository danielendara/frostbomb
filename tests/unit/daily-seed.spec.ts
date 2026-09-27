import { describe, expect, it } from "vitest";
import { dailySeed } from "../../src/snowflake/random";
import { SEED_PATTERN } from "../../src/url-state";

function utcLabel(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `d${year}${month}${day}`;
}

describe("dailySeed", () => {
  it("returns a fixed dYYYYMMDD label that passes SEED_PATTERN", () => {
    const label = dailySeed(new Date(2026, 8, 25));
    expect(label).toBe("d20260925");
    expect(label).toMatch(/^d\d{8}$/);
    expect(SEED_PATTERN.test(label)).toBe(true);
  });

  it("is stable for the same local calendar date regardless of time", () => {
    const morning = dailySeed(new Date(2026, 8, 25, 0, 0, 0));
    const evening = dailySeed(new Date(2026, 8, 25, 23, 59, 59, 999));
    expect(morning).toBe("d20260925");
    expect(evening).toBe(morning);
  });

  it("steps across month boundaries", () => {
    expect(dailySeed(new Date(2026, 8, 30))).toBe("d20260930");
    expect(dailySeed(new Date(2026, 9, 1))).toBe("d20261001");
    expect(dailySeed(new Date(2024, 1, 29))).toBe("d20240229");
    expect(dailySeed(new Date(2024, 2, 1))).toBe("d20240301");
  });

  it("steps across year boundaries", () => {
    expect(dailySeed(new Date(2026, 11, 31))).toBe("d20261231");
    expect(dailySeed(new Date(2027, 0, 1))).toBe("d20270101");
    expect(dailySeed(new Date(1999, 11, 31))).toBe("d19991231");
    expect(dailySeed(new Date(2000, 0, 1))).toBe("d20000101");
  });

  it("uses local calendar parts, not the UTC date", () => {
    const local = new Date(2026, 8, 25, 23, 30, 0);
    expect(dailySeed(local)).toBe("d20260925");

    // When the zone offset makes UTC a different calendar day, the label
    // must follow the local date. UTC itself cannot differ from local.
    const lateUtc = new Date(Date.UTC(2026, 8, 25, 23, 30));
    const earlyUtc = new Date(Date.UTC(2026, 8, 25, 0, 30));
    const probe = lateUtc.getTimezoneOffset() < 0 ? lateUtc : earlyUtc;
    if (probe.getTimezoneOffset() !== 0) {
      expect(dailySeed(probe)).not.toBe(utcLabel(probe));
      const year = String(probe.getFullYear()).padStart(4, "0");
      const month = String(probe.getMonth() + 1).padStart(2, "0");
      const day = String(probe.getDate()).padStart(2, "0");
      expect(dailySeed(probe)).toBe(`d${year}${month}${day}`);
    }
  });
});
