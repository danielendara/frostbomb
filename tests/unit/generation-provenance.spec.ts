/**
 * Encode/reopen of a crystal (#341).
 *
 * Goldens pin the sampled pipeline and the manual pipeline separately. They do
 * not pin the transition: copying a sampled crystal used to write its rounded
 * initial point, and reopening that link took the manual path.
 */
import { describe, expect, it } from "vitest";
import { buildSnowflake, type BuildResult } from "../../src/snowflake/geometry";
import {
  getHabit,
  sampleConditions,
  type GrowthConditions,
} from "../../src/snowflake/nakaya";
import { hashString, mulberry32, Rand } from "../../src/snowflake/random";
import {
  parseCrystalUrlState,
  quantizeLabConditions,
  writeCrystalGeneration,
  type CrystalUrlState,
} from "../../src/url-state";

/** `buildSnowflake` returns views of shared buffers; copy before the next grow. */
function snapshot(result: BuildResult): BuildResult {
  return {
    armCount: result.armCount,
    branchCount: result.branchCount,
    delays: result.delays.slice(),
    matrices: result.matrices.slice(),
    core: {
      position: [...result.core.position],
      rotation: [...result.core.rotation],
      scale: [...result.core.scale],
      dist: result.core.dist,
      depth: result.core.depth,
    },
  };
}

function growSeed(label: string): { conditions: GrowthConditions; result: BuildResult } {
  const rand = new Rand(mulberry32(hashString(label)));
  const conditions = sampleConditions(rand);
  return { conditions, result: snapshot(buildSnowflake(conditions, rand)) };
}

function growManual(label: string, temperatureC: number, supersaturation: number): BuildResult {
  const rand = new Rand(mulberry32(hashString(label)));
  return snapshot(
    buildSnowflake(
      {
        temperatureC,
        supersaturation,
        habit: getHabit(temperatureC, supersaturation),
        path: [{ temp: temperatureC, ss: supersaturation }],
      },
      rand,
    ),
  );
}

/** What boot/restore does with a parsed share link. */
function replay(state: CrystalUrlState): BuildResult {
  const label = state.seed ?? "abcde";
  if (state.provenance === "manual" && state.lab) {
    return growManual(label, state.lab.temperatureC, state.lab.supersaturation);
  }
  return growSeed(label).result;
}

function sameGeometry(a: BuildResult, b: BuildResult): boolean {
  if (a.branchCount !== b.branchCount || a.armCount !== b.armCount) return false;
  if (a.matrices.length !== b.matrices.length || a.delays.length !== b.delays.length) return false;
  for (let i = 0; i < a.matrices.length; i++) {
    if (a.matrices[i] !== b.matrices[i]) return false;
  }
  for (let i = 0; i < a.delays.length; i++) {
    if (a.delays[i] !== b.delays[i]) return false;
  }
  return true;
}

describe("sampled crystal round-trip (#341)", () => {
  it("replays the sampled crystal from a seed-only link, not the rounded point", () => {
    const sampled = growSeed("abcde");
    const displayed = quantizeLabConditions({
      temperatureC: sampled.conditions.temperatureC,
      supersaturation: sampled.conditions.supersaturation,
    });
    const manualFromDisplayed = growManual(
      "abcde",
      displayed.temperatureC,
      displayed.supersaturation,
    );

    // The bug: ?seed=abcde is 301 branches; t/ss of the rounded point is not.
    expect(sampled.result.branchCount).toBe(301);
    expect(manualFromDisplayed.branchCount).not.toBe(sampled.result.branchCount);

    const params = new URLSearchParams("seed=abcde");
    writeCrystalGeneration(params, "sampled", sampled.conditions);
    const reopened = replay(parseCrystalUrlState(`?${params.toString()}`));
    expect(sameGeometry(reopened, sampled.result)).toBe(true);

    const legacy = new URLSearchParams("seed=abcde");
    writeCrystalGeneration(legacy, "manual", sampled.conditions);
    const legacyReplay = replay(parseCrystalUrlState(`?${legacy.toString()}`));
    expect(sameGeometry(legacyReplay, sampled.result)).toBe(false);
    expect(sameGeometry(legacyReplay, manualFromDisplayed)).toBe(true);
  });

  it("replays an explicit Lab link as a fixed point, including after a seed change", () => {
    const original = growManual("abcde", -15, 0.6);
    const params = new URLSearchParams("seed=abcde");
    writeCrystalGeneration(params, "manual", { temperatureC: -15.04, supersaturation: 0.604 });
    expect(sameGeometry(replay(parseCrystalUrlState(`?${params.toString()}`)), original)).toBe(true);

    params.set("seed", "fghij");
    const changed = growManual("fghij", -15, 0.6);
    expect(sameGeometry(replay(parseCrystalUrlState(`?${params.toString()}`)), changed)).toBe(true);
    expect(sameGeometry(changed, growSeed("fghij").result)).toBe(false);
  });
});
