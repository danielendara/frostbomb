import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  PostprocessingPipeline,
  shouldSkipPostprocessing,
  type PostprocessingPipelineOptions,
} from "../../src/snowflake/postprocessing.ts";
import {
  MARK_POSTPROCESSING_READY,
  hasMark,
  resetPerfMarksForTests,
} from "../../src/snowflake/perf-marks.ts";

describe("shouldSkipPostprocessing", () => {
  it("skips bloom when prefers-reduced-motion is set", () => {
    expect(
      shouldSkipPostprocessing({
        prefersReducedMotion: true,
        saveData: false,
        deviceMemory: 8,
        hardwareConcurrency: 8,
      }),
    ).toBe(true);
  });

  it("skips bloom when Save-Data is requested", () => {
    expect(
      shouldSkipPostprocessing({
        prefersReducedMotion: false,
        saveData: true,
        deviceMemory: 8,
        hardwareConcurrency: 8,
      }),
    ).toBe(true);
  });

  it("skips bloom on the low-power deviceMemory heuristic", () => {
    expect(
      shouldSkipPostprocessing({
        prefersReducedMotion: false,
        saveData: false,
        deviceMemory: 4,
        hardwareConcurrency: 8,
      }),
    ).toBe(true);
  });

  it("skips bloom on the low-power hardwareConcurrency heuristic", () => {
    expect(
      shouldSkipPostprocessing({
        prefersReducedMotion: false,
        saveData: false,
        deviceMemory: 8,
        hardwareConcurrency: 2,
      }),
    ).toBe(true);
  });

  it("loads bloom on a capable desktop client", () => {
    expect(
      shouldSkipPostprocessing({
        prefersReducedMotion: false,
        saveData: false,
        deviceMemory: 8,
        hardwareConcurrency: 8,
      }),
    ).toBe(false);
  });
});

describe("PostprocessingPipeline.requestLoad bounded retry", () => {
  type Importer = NonNullable<PostprocessingPipelineOptions["importer"]>;

  const FRAME_MS = 16;
  const composerRender = vi.fn();

  class StubComposer {
    addPass() {}
    setSize() {}
    dispose() {}
    render = composerRender;
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

  const rejectingImporter = () => vi.fn<Importer>(() => Promise.reject(new Error("chunk blocked")));

  /** Drives `requestLoad` once per simulated animation frame on a fake clock. */
  function createHarness(importer: Importer) {
    let clock = 0;
    const renderer = { render: vi.fn() };
    const pipeline = new PostprocessingPipeline(
      renderer as unknown as import("three").WebGLRenderer,
      {} as unknown as import("three").Scene,
      {} as unknown as import("three").PerspectiveCamera,
      { importer, now: () => clock },
    );
    async function frames(count: number): Promise<void> {
      for (let i = 0; i < count; i++) {
        pipeline.requestLoad(false);
        clock += FRAME_MS;
        // Runs the setTimeout(0) that starts the load and settles its promise.
        await vi.advanceTimersByTimeAsync(FRAME_MS);
      }
    }
    async function framesUntilElapsed(ms: number): Promise<void> {
      while (clock < ms) await frames(1);
    }
    async function framesUntil(done: () => boolean, maxFrames = 1_000): Promise<void> {
      for (let i = 0; i < maxFrames && !done(); i++) await frames(1);
    }
    function rendersWithEffects(): boolean {
      renderer.render.mockClear();
      composerRender.mockClear();
      pipeline.render();
      return composerRender.mock.calls.length === 1 && renderer.render.mock.calls.length === 0;
    }
    return {
      pipeline,
      frames,
      framesUntil,
      framesUntilElapsed,
      rendersWithEffects,
      elapsed: () => clock,
    };
  }

  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    resetPerfMarksForTests();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("gives up after 3 import attempts and logs once when the chunk always fails", async () => {
    const attemptTimes: number[] = [];
    const importer = vi.fn<Importer>(() => {
      attemptTimes.push(harness.elapsed());
      return Promise.reject(new Error("chunk blocked"));
    });
    const harness = createHarness(importer);

    // 600 frames at 16 ms is 9.6 s. With backoffs of 2 s then 5 s the attempts
    // land at ~0 s, ~2 s and ~7 s, so the third failure (the give-up) is inside
    // the window and the remaining ~2.5 s of frames are no-ops.
    await harness.frames(600);

    expect(harness.elapsed()).toBe(9_600);
    expect(importer).toHaveBeenCalledTimes(3);
    expect(attemptTimes[1] - attemptTimes[0]).toBeGreaterThanOrEqual(2_000);
    expect(attemptTimes[2] - attemptTimes[1]).toBeGreaterThanOrEqual(5_000);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(harness.rendersWithEffects()).toBe(false);
  });

  it("bounds retries through the default dynamic import when no importer is injected", async () => {
    let attempts = 0;
    vi.resetModules();
    vi.doMock("postprocessing", () => {
      attempts++;
      throw new Error("simulated persistent chunk failure");
    });
    try {
      const { PostprocessingPipeline: FreshPipeline } = await import(
        "../../src/snowflake/postprocessing.ts"
      );
      let clock = 0;
      const pipeline = new FreshPipeline(
        { render: vi.fn() } as unknown as import("three").WebGLRenderer,
        {} as unknown as import("three").Scene,
        {} as unknown as import("three").PerspectiveCamera,
        { now: () => clock },
      );

      for (let frame = 0; frame < 600; frame++) {
        pipeline.requestLoad(false);
        clock += FRAME_MS;
        await vi.advanceTimersByTimeAsync(FRAME_MS);
      }

      expect(attempts).toBe(3);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.doUnmock("postprocessing");
      vi.resetModules();
    }
  });

  it("loads effects on the second attempt once the backoff has elapsed", async () => {
    const importer = vi
      .fn<Importer>()
      .mockRejectedValueOnce(new Error("transient chunk failure"))
      .mockResolvedValue(stubModule());
    const harness = createHarness(importer);

    // First frame starts attempt 1, which fails. The first backoff is 2 s, so
    // nothing else is imported before then and the plain renderer keeps drawing.
    await harness.framesUntilElapsed(1_500);
    expect(importer).toHaveBeenCalledTimes(1);
    expect(harness.rendersWithEffects()).toBe(false);
    expect(hasMark(MARK_POSTPROCESSING_READY)).toBe(false);

    await harness.framesUntilElapsed(2_500);
    expect(importer).toHaveBeenCalledTimes(2);
    expect(harness.rendersWithEffects()).toBe(true);
    expect(hasMark(MARK_POSTPROCESSING_READY)).toBe(true);
    // A failure that later recovers is not an error worth logging.
    expect(errorSpy).not.toHaveBeenCalled();

    // Loaded: further frames never touch the importer again.
    await harness.frames(300);
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it("marks postprocessing ready only once it has given up", async () => {
    const importer = rejectingImporter();
    const harness = createHarness(importer);

    await harness.framesUntil(() => importer.mock.calls.length >= 2);
    await harness.frames(1);
    expect(importer).toHaveBeenCalledTimes(2);
    expect(hasMark(MARK_POSTPROCESSING_READY)).toBe(false);

    await harness.framesUntil(() => importer.mock.calls.length >= 3);
    await harness.frames(1);
    expect(importer).toHaveBeenCalledTimes(3);
    expect(hasMark(MARK_POSTPROCESSING_READY)).toBe(true);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("stays settled after giving up: no more imports, logs or timers", async () => {
    const importer = rejectingImporter();
    const harness = createHarness(importer);

    await harness.frames(600);
    expect(importer).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    // Far past any backoff (the issue's longest example is 30 s): 4000 frames is 64 s more.
    await harness.frames(4_000);

    expect(harness.elapsed()).toBeGreaterThan(70_000);
    expect(importer).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(harness.rendersWithEffects()).toBe(false);
  });

  it("lets an explicit load(false) retry after giving up", async () => {
    const importer = vi
      .fn<Importer>()
      .mockRejectedValueOnce(new Error("chunk blocked"))
      .mockRejectedValueOnce(new Error("chunk blocked"))
      .mockRejectedValueOnce(new Error("chunk blocked"))
      .mockResolvedValue(stubModule());
    const harness = createHarness(importer);

    await harness.frames(600);
    await harness.frames(1_000);
    expect(importer).toHaveBeenCalledTimes(3);
    expect(harness.rendersWithEffects()).toBe(false);

    // Reduced motion turned off: a user action, so the give-up is reset.
    await harness.pipeline.load(false);

    expect(importer).toHaveBeenCalledTimes(4);
    expect(harness.rendersWithEffects()).toBe(true);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("gives an explicit load(false) its own bounded retry budget and never rejects", async () => {
    const importer = rejectingImporter();
    const harness = createHarness(importer);

    await harness.frames(600);
    expect(importer).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    await expect(harness.pipeline.load(false)).resolves.toBeUndefined();
    expect(importer).toHaveBeenCalledTimes(4);

    // Two more attempts from the frame loop, then it settles again: 3 more
    // attempts and 1 more log for this user-driven episode, not one per frame.
    await harness.frames(1_000);
    expect(importer).toHaveBeenCalledTimes(6);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });
});

describe("PostprocessingPipeline skip gate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("does not load bloom when skipped, and photo-mode still renders without DoF", async () => {
    let importAttempts = 0;

    vi.doMock("postprocessing", () => {
      importAttempts++;
      class Stub {
        addPass() {}
        setSize() {}
        dispose() {}
      }
      return {
        EffectComposer: Stub,
        EffectPass: class extends Stub {
          constructor() {
            super();
          }
        },
        RenderPass: class {},
        BloomEffect: class {},
        SMAAEffect: class {},
        SMAAPreset: { HIGH: 1 },
        DepthOfFieldEffect: class {
          constructor() {}
        },
      };
    });

    const { PostprocessingPipeline } = await import(
      "../../src/snowflake/postprocessing.ts"
    );

    const fakeRenderer = { render: vi.fn() } as unknown as import("three").WebGLRenderer;
    const fakeScene = {} as unknown as import("three").Scene;
    const fakeCamera = {} as unknown as import("three").PerspectiveCamera;

    const pipeline = new PostprocessingPipeline(fakeRenderer, fakeScene, fakeCamera);
    pipeline.requestLoad(true);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(importAttempts).toBe(0);

    pipeline.setPhotoMode(true);
    pipeline.render();
    expect(fakeRenderer.render).toHaveBeenCalled();
  });
});
