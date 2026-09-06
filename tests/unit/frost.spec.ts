import { describe, expect, it } from "vitest";
import { FROST_SEED, FROST_SIZE, generateFrostBuffers } from "../../src/snowflake/frost-data.ts";

describe("generateFrostBuffers", () => {
  it("is deterministic for the fixed frost seed", () => {
    const first = generateFrostBuffers();
    const second = generateFrostBuffers();
    expect(first.roughnessData).toEqual(second.roughnessData);
    expect(first.normalData).toEqual(second.normalData);
  });

  it("produces full-size RGBA frost maps", () => {
    const { roughnessData, normalData } = generateFrostBuffers();
    expect(roughnessData.length).toBe(FROST_SIZE * FROST_SIZE * 4);
    expect(normalData.length).toBe(FROST_SIZE * FROST_SIZE * 4);
    expect(FROST_SEED).toBe(0x66726f73);
  });
});
