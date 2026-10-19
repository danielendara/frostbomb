/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PostprocessingPipeline,
  type PostprocessingPipelineOptions,
} from "../../src/snowflake/postprocessing.ts";
import {
  QUALITY_PARAM,
  SLOW_FRAME_LIMIT,
  TIER_PROFILES,
  TierController,
  dprCapFor,
  parseQualityOverride,
  selectStartingTier,
  type TierHints,
} from "../../src/snowflake/quality.ts";
import {
  SHARE_PARAM_LAB,
  SHARE_PARAM_PINK,
  SHARE_PARAM_PRISM,
  SHARE_PARAM_ROTATE,
  SHARE_PARAM_SEED,
  setShareFlag,
} from "../../src/share-url-params.ts";

const CAPABLE: TierHints = {
  prefersReducedMotion: false,
  saveData: false,
  deviceMemory: 8,
  hardwareConcurrency: 8,
  coarsePointer: false,
  viewportWidth: 1440,
};

describe("selectStartingTier", () => {
  const table: Array<[string, Partial<TierHints>, "rich" | "lite"]> = [
    ["capable desktop", {}, "rich"],
    ["reduced motion", { prefersReducedMotion: true }, "lite"],
    ["Save-Data", { saveData: true }, "lite"],
    ["deviceMemory <= 4", { deviceMemory: 4 }, "lite"],
    ["hardwareConcurrency <= 2", { hardwareConcurrency: 2 }, "lite"],
    ["coarse pointer at 480 px", { coarsePointer: true, viewportWidth: 480 }, "lite"],
    ["coarse pointer at 360 px", { coarsePointer: true, viewportWidth: 360 }, "lite"],
    ["coarse pointer at 481 px (tablet)", { coarsePointer: true, viewportWidth: 481 }, "rich"],
    ["fine pointer at 360 px", { coarsePointer: false, viewportWidth: 360 }, "rich"],
    ["?quality=lite on a capable desktop", { override: "lite" }, "lite"],
    ["?quality=rich on a low-power client", { override: "rich", deviceMemory: 2 }, "rich"],
    ["?quality=rich under reduced motion", { override: "rich", prefersReducedMotion: true }, "lite"],
  ];

  it.each(table)("%s", (_name, patch, expected) => {
    expect(selectStartingTier({ ...CAPABLE, ...patch })).toBe(expected);
  });
});

describe("parseQualityOverride", () => {
  it("reads rich and lite from location.search, case-insensitively", () => {
    expect(parseQualityOverride("?quality=rich")).toBe("rich");
    expect(parseQualityOverride("?seed=fox&quality=LITE")).toBe("lite");
  });

  it("ignores absent or unknown values", () => {
    expect(parseQualityOverride("")).toBeNull();
    expect(parseQualityOverride("?quality=ultra")).toBeNull();
    expect(parseQualityOverride("?quality=")).toBeNull();
  });
});

describe("tier profile", () => {
  it("pins the DPR cap, particle and transmission table", () => {
    expect(dprCapFor("rich", false)).toBe(2);
    expect(dprCapFor("lite", false)).toBe(1.5);
    expect(dprCapFor("rich", true)).toBe(1);
    expect(dprCapFor("lite", true)).toBe(1);
    expect(TIER_PROFILES.rich.particleCount).toBe(200);
    expect(TIER_PROFILES.lite.particleCount).toBe(80);
    expect(TIER_PROFILES.rich.transmission).toBeNull();
    expect(TIER_PROFILES.lite.transmission).toBe(0);
  });
});

describe("TierController", () => {
  const SLOW = 1 / 30; // 33 ms
  const FAST = 1 / 60;

  function feed(controller: TierController, delta: number, frames: number): number | null {
    let demotedAt: number | null = null;
    for (let i = 1; i <= frames; i++) {
      if (controller.update(delta) && demotedAt === null) demotedAt = i;
    }
    return demotedAt;
  }

  it("demotes RICH to LITE after a sustained slow-frame sequence", () => {
    const controller = new TierController("rich");
    const demotedAt = feed(controller, SLOW, 400);
    expect(controller.tier).toBe("lite");
    // EMA needs a few frames to cross 25 ms, then 90 slow frames in a row.
    expect(demotedAt).toBeGreaterThanOrEqual(SLOW_FRAME_LIMIT);
    expect(demotedAt).toBeLessThan(SLOW_FRAME_LIMIT + 20);
  });

  it("returns the new tier exactly once", () => {
    const controller = new TierController("rich");
    const results = Array.from({ length: 300 }, () => controller.update(SLOW)).filter(Boolean);
    expect(results).toEqual(["lite"]);
  });

  it("keeps RICH on fast frames and on a short stall", () => {
    const controller = new TierController("rich");
    feed(controller, FAST, 600);
    feed(controller, SLOW, 30);
    feed(controller, FAST, 600);
    expect(controller.tier).toBe("rich");
  });

  it("does not oscillate: fast frames after demotion keep LITE", () => {
    const controller = new TierController("rich");
    feed(controller, SLOW, 400);
    expect(controller.tier).toBe("lite");
    for (let i = 0; i < 20; i++) {
      feed(controller, FAST, 300);
      feed(controller, SLOW, 100);
      expect(controller.tier).toBe("lite");
    }
  });

  it("stays LITE when it starts LITE", () => {
    const controller = new TierController("lite");
    expect(feed(controller, FAST, 600)).toBeNull();
    expect(controller.tier).toBe("lite");
  });
});

describe("LITE never calls the postprocessing importer", () => {
  type Importer = NonNullable<PostprocessingPipelineOptions["importer"]>;

  class StubComposer {
    addPass() {}
    setSize() {}
    dispose = vi.fn();
    render = vi.fn();
  }

  function stubModule(): Awaited<ReturnType<Importer>> {
    return {
      EffectComposer: StubComposer,
      EffectPass: class {},
      RenderPass: class {},
      BloomEffect: class {},
      SMAAEffect: class {},
      SMAAPreset: { HIGH: 1 },
      DepthOfFieldEffect: class {},
    } as unknown as Awaited<ReturnType<Importer>>;
  }

  function makePipeline(importer: Importer) {
    const renderer = { render: vi.fn() };
    const pipeline = new PostprocessingPipeline(
      renderer as unknown as import("three").WebGLRenderer,
      {} as unknown as import("three").Scene,
      {} as unknown as import("three").PerspectiveCamera,
      { importer },
    );
    return { pipeline, renderer };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("never imports across many frames, an explicit load and a retry window", async () => {
    const importer = vi.fn<Importer>(async () => stubModule());
    const { pipeline } = makePipeline(importer);
    pipeline.setTier("lite");

    for (let i = 0; i < 120; i++) {
      pipeline.requestLoad(false);
      await vi.advanceTimersByTimeAsync(16);
    }
    await pipeline.load(false);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(importer).not.toHaveBeenCalled();
  });

  it("still imports on RICH (the guard is the only thing stopping it)", async () => {
    const importer = vi.fn<Importer>(async () => stubModule());
    const { pipeline } = makePipeline(importer);
    pipeline.setTier("rich");
    pipeline.requestLoad(false);
    await vi.advanceTimersByTimeAsync(16);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("demoting after the effects loaded falls back to the plain renderer", async () => {
    const importer = vi.fn<Importer>(async () => stubModule());
    const { pipeline, renderer } = makePipeline(importer);
    pipeline.requestLoad(false);
    await vi.advanceTimersByTimeAsync(16);
    expect(importer).toHaveBeenCalledTimes(1);

    pipeline.setTier("lite");
    pipeline.render();
    expect(renderer.render).toHaveBeenCalledTimes(1);

    pipeline.requestLoad(false);
    await vi.advanceTimersByTimeAsync(16);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("drops a load that was in flight when the tier fell", async () => {
    let release!: () => void;
    const importer = vi.fn<Importer>(
      () =>
        new Promise((resolve) => {
          release = () => resolve(stubModule());
        }),
    );
    const { pipeline, renderer } = makePipeline(importer);
    pipeline.requestLoad(false);
    await vi.advanceTimersByTimeAsync(16);
    expect(importer).toHaveBeenCalledTimes(1);

    pipeline.setTier("lite");
    release();
    await vi.advanceTimersByTimeAsync(16);

    pipeline.render();
    expect(renderer.render).toHaveBeenCalledTimes(1);
  });
});

describe("share links never carry quality", () => {
  // The copied link itself is covered end to end in tests/quality-tier.spec.ts.
  it("is not one of the share params and no share flag writes it", () => {
    const params = new URLSearchParams();
    params.set(SHARE_PARAM_SEED, "fox");
    for (const name of [SHARE_PARAM_PINK, SHARE_PARAM_PRISM, SHARE_PARAM_ROTATE, SHARE_PARAM_LAB] as const) {
      setShareFlag(params, name, true);
      setShareFlag(params, name, false);
    }
    expect(QUALITY_PARAM).toBe("quality");
    expect(params.has(QUALITY_PARAM)).toBe(false);
    expect(params.toString()).not.toContain("quality");
  });
});
