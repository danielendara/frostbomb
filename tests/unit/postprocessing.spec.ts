/** @vitest-environment happy-dom */
import { describe, expect, it, vi, beforeEach } from "vitest";

describe("PostprocessingPipeline.requestLoad retry behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("retries after a failed load instead of getting stuck forever", async () => {
    let importAttempts = 0;

    vi.doMock("postprocessing", () => {
      importAttempts++;
      if (importAttempts === 1) {
        // Simulate a transient failure (e.g. a flaky network chunk load).
        throw new Error("simulated chunk load failure");
      }
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

    // First attempt: scheduled via setTimeout(0) inside requestLoad, and fails.
    pipeline.requestLoad(false);
    await vi.waitFor(() => expect(importAttempts).toBe(1));
    // Let the rejected `load()` promise settle.
    await new Promise((resolve) => setTimeout(resolve, 10));

    // A later frame calls requestLoad again (this happens every animation frame
    // in scene.ts). It should retry now that the first attempt is done.
    pipeline.requestLoad(false);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(importAttempts).toBe(2);
  });
});
