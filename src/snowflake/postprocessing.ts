import * as THREE from "three";
import { MARK_POSTPROCESSING_READY, markOnce } from "./perf-marks";

export interface PostprocessingSkipHints {
  prefersReducedMotion: boolean;
  saveData?: boolean;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

type NavigatorHints = Navigator & {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
};

/** Skip bloom/DoF/SMAA on reduced motion, Save-Data, or a low-power client. */
export function shouldSkipPostprocessing(hints: PostprocessingSkipHints): boolean {
  if (hints.prefersReducedMotion) return true;
  if (hints.saveData) return true;
  if (typeof hints.deviceMemory === "number" && hints.deviceMemory > 0 && hints.deviceMemory <= 4) {
    return true;
  }
  if (
    typeof hints.hardwareConcurrency === "number" &&
    hints.hardwareConcurrency > 0 &&
    hints.hardwareConcurrency <= 2
  ) {
    return true;
  }
  return false;
}

export function skipPostprocessingFromEnvironment(
  prefersReducedMotion: boolean,
  nav: Navigator = navigator,
): boolean {
  const hints = nav as NavigatorHints;
  return shouldSkipPostprocessing({
    prefersReducedMotion,
    saveData: hints.connection?.saveData === true,
    deviceMemory: hints.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
  });
}

export interface RenderPipeline {
  render: (delta?: number) => void;
  setSize: (width: number, height: number) => void;
  dispose: () => void;
}

/**
 * Destructuring at the import site (not passing the whole namespace around)
 * lets the bundler tree-shake the deferred chunk down to what the pipeline uses.
 */
async function importPostprocessing() {
  const {
    EffectComposer,
    EffectPass,
    RenderPass,
    BloomEffect,
    SMAAEffect,
    SMAAPreset,
    DepthOfFieldEffect,
  } = await import("postprocessing");
  return {
    EffectComposer,
    EffectPass,
    RenderPass,
    BloomEffect,
    SMAAEffect,
    SMAAPreset,
    DepthOfFieldEffect,
  };
}

type PostprocessingModule = Awaited<ReturnType<typeof importPostprocessing>>;

export interface PostprocessingPipelineOptions {
  /** Loads the `postprocessing` chunk. Tests inject a fake instead of a real chunk. */
  importer?: () => Promise<PostprocessingModule>;
  /** Millisecond clock that paces retries. Tests inject a fake clock. */
  now?: () => number;
}

/**
 * Wait after the 1st and 2nd failed load before trying again. A 3rd failure
 * gives up, so a persistently failing chunk costs at most 3 import attempts
 * (about 7 s of retrying) instead of one per animation frame.
 */
const RETRY_BACKOFF_MS = [2_000, 5_000];
const MAX_LOAD_ATTEMPTS = RETRY_BACKOFF_MS.length + 1;

export class PostprocessingPipeline implements RenderPipeline {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private currentComposer: RenderPipeline;
  private isLoaded = false;
  private isLoading = false;
  private isRequested = false;
  private failedAttempts = 0;
  private nextAttemptAt = 0;
  private gaveUp = false;
  private photoMode = false;
  private dofPass: { enabled: boolean } | null = null;
  private readonly focusTarget = new THREE.Vector3(0, 0, 0);
  private readonly importer: () => Promise<PostprocessingModule>;
  private readonly now: () => number;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    options: PostprocessingPipelineOptions = {},
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.importer = options.importer ?? importPostprocessing;
    this.now = options.now ?? (() => performance.now());
    this.currentComposer = {
      render: () => this.renderer.render(this.scene, this.camera),
      setSize: () => {},
      dispose: () => {},
    };
  }

  public render(delta?: number): void {
    this.currentComposer.render(delta);
  }

  public setSize(width: number, height: number): void {
    this.currentComposer.setSize(width, height);
  }

  public dispose(): void {
    this.currentComposer.dispose();
    this.dofPass = null;
  }

  public setPhotoMode(enabled: boolean): void {
    this.photoMode = enabled;
    if (this.dofPass) this.dofPass.enabled = enabled;
  }

  /**
   * Safe to call every frame: it returns immediately once effects are loaded,
   * while a failed load is backing off, and for good after giving up (the
   * plain renderer keeps working).
   */
  public requestLoad(skipEffects: boolean): void {
    if (this.isLoaded) return;
    if (skipEffects) {
      markOnce(MARK_POSTPROCESSING_READY);
      return;
    }
    if (this.gaveUp || this.isRequested || this.isLoading) return;
    if (this.now() < this.nextAttemptAt) return;
    this.isRequested = true;
    window.setTimeout(() => {
      void this.loadEffects().finally(() => {
        // Let a later frame schedule the next attempt once its backoff has
        // elapsed. Harmless once `isLoaded` is true or after giving up, since
        // `requestLoad()` bails out early in both cases.
        this.isRequested = false;
      });
    }, 0);
  }

  /**
   * Explicit load, e.g. reduced motion turned off. That is a user action, so it
   * starts a fresh retry budget even after giving up. Never rejects: a failed
   * load counts toward that budget like any other.
   */
  public async load(skipEffects: boolean): Promise<void> {
    if (this.isLoaded) return;
    if (skipEffects) {
      markOnce(MARK_POSTPROCESSING_READY);
      return;
    }
    if (this.isLoading) return;
    this.gaveUp = false;
    this.failedAttempts = 0;
    this.nextAttemptAt = 0;
    await this.loadEffects();
  }

  private async loadEffects(): Promise<void> {
    if (this.isLoaded || this.isLoading) return;
    this.isLoading = true;

    try {
      const {
        EffectComposer,
        EffectPass,
        RenderPass,
        BloomEffect,
        SMAAEffect,
        SMAAPreset,
        DepthOfFieldEffect,
      } = await this.importer();

      const nextComposer = new EffectComposer(this.renderer);
      nextComposer.addPass(new RenderPass(this.scene, this.camera));

      const bloomEffect = new BloomEffect({
        intensity: 1.1,
        luminanceThreshold: 0.55,
        luminanceSmoothing: 0.3,
        mipmapBlur: true,
        radius: 0.75,
      });

      const dofEffect = new DepthOfFieldEffect(this.camera, {
        focusDistance: 10,
        focusRange: 5,
        bokehScale: 1.5,
        resolutionScale: 0.5,
      });
      dofEffect.target = this.focusTarget;

      const dofPass = new EffectPass(this.camera, dofEffect);
      dofPass.enabled = this.photoMode;

      const smaaEffect = new SMAAEffect({ preset: SMAAPreset.HIGH });

      nextComposer.addPass(new EffectPass(this.camera, bloomEffect));
      nextComposer.addPass(dofPass);
      nextComposer.addPass(new EffectPass(this.camera, smaaEffect));
      nextComposer.setSize(window.innerWidth, window.innerHeight);

      this.currentComposer.dispose();
      this.currentComposer = nextComposer;
      this.dofPass = dofPass;
      this.isLoaded = true;
      markOnce(MARK_POSTPROCESSING_READY);
    } catch (err) {
      this.recordLoadFailure(err);
    } finally {
      this.isLoading = false;
    }
  }

  private recordLoadFailure(err: unknown): void {
    this.failedAttempts++;
    if (this.failedAttempts < MAX_LOAD_ATTEMPTS) {
      this.nextAttemptAt = this.now() + RETRY_BACKOFF_MS[this.failedAttempts - 1];
      return;
    }
    // Settle into "effects unavailable": keep the plain renderer, stop
    // retrying, and log once for the whole failure episode. Marking ready keeps
    // perf marks and smoke tests from waiting on effects that will not come.
    this.gaveUp = true;
    console.error(
      `Postprocessing effects unavailable after ${this.failedAttempts} failed load attempts:`,
      err,
    );
    markOnce(MARK_POSTPROCESSING_READY);
  }
}
