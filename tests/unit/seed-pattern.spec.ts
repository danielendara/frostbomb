import { describe, expect, it } from "vitest";
import { SEED_PATTERN } from "../../src/url-state";

const CASES: ReadonlyArray<{ input: string; accepted: boolean; label: string }> = [
  { input: "", accepted: false, label: "empty" },
  { input: "ab", accepted: false, label: "too short (2)" },
  { input: "abc", accepted: true, label: "boundary length 3" },
  { input: "abcdefghijkl", accepted: true, label: "boundary length 12" },
  { input: "abcdefghijklm", accepted: false, label: "too long (13)" },
  { input: "AbC123", accepted: true, label: "mixed case" },
  { input: "ab_12", accepted: false, label: "non-alphanumeric underscore" },
  { input: "ab-12", accepted: false, label: "non-alphanumeric hyphen" },
  { input: "ab 12", accepted: false, label: "non-alphanumeric space" },
];

describe("SEED_PATTERN", () => {
  it.each(CASES)("$label: $input → $accepted", ({ input, accepted }) => {
    expect(SEED_PATTERN.test(input)).toBe(accepted);
  });
});
