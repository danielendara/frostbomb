import { shouldSkipPostprocessing, type PostprocessingSkipHints } from "./postprocessing";

/**
 * RICH targets decent laptops and desktops; LITE targets basic phones.
 * The tier is chosen once at boot, may only fall (RICH to LITE) on its own, and
 * is never written to the URL (it is a debug/perf knob, not part of a crystal).
 */
export type QualityTier = "rich" | "lite";

/** `?quality=rich|lite` debug override. Read here, never by `url-state.ts`, never in share links. */
export const QUALITY_PARAM = "quality";

export interface TierHints extends PostprocessingSkipHints {
  /** `(pointer: coarse)` matches. */
  coarsePointer?: boolean;
  /** CSS px (`window.innerWidth`). */
  viewportWidth?: number;
  /** Parsed `?quality=`; reduced motion still wins. */
  override?: QualityTier | null;
}

/** A coarse-pointer viewport this narrow or narrower is a basic phone. */
export const LITE_MAX_VIEWPORT_CSS_PX = 480;

export interface TierProfile {
  /** Upper bound for the renderer pixel ratio. */
  dprCap: number;
  /** Active snowfall particles. */
  particleCount: number;
  /** `MeshPhysicalMaterial.transmission`. `null` keeps the material's own value. */
  transmission: number | null;
  /** Whether the postprocessing chunk may be fetched. */
  postprocessing: boolean;
}

export const TIER_PROFILES: Readonly<Record<QualityTier, TierProfile>> = {
  rich: { dprCap: 2, particleCount: 200, transmission: null, postprocessing: true },
  // transmission 0 is a stand-in until the LITE look is tuned.
  lite: { dprCap: 1.5, particleCount: 80, transmission: 0, postprocessing: false },
};

/** Reduced motion renders at CSS resolution regardless of tier. */
export const REDUCED_MOTION_DPR_CAP = 1;

export function dprCapFor(tier: QualityTier, prefersReducedMotion: boolean): number {
  return prefersReducedMotion ? REDUCED_MOTION_DPR_CAP : TIER_PROFILES[tier].dprCap;
}

export function selectStartingTier(hints: TierHints): QualityTier {
  // Reduced motion forces LITE, even over an explicit override.
  if (hints.prefersReducedMotion) return "lite";
  if (hints.override) return hints.override;
  if (shouldSkipPostprocessing(hints)) return "lite";
  if (
    hints.coarsePointer === true &&
    typeof hints.viewportWidth === "number" &&
    hints.viewportWidth <= LITE_MAX_VIEWPORT_CSS_PX
  ) {
    return "lite";
  }
  return "rich";
}

export function parseQualityOverride(search: string): QualityTier | null {
  let value: string | null;
  try {
    value = new URLSearchParams(search).get(QUALITY_PARAM);
  } catch {
    return null;
  }
  const v = value?.toLowerCase();
  return v === "rich" || v === "lite" ? v : null;
}

export function readTierHints(
  prefersReducedMotion: boolean,
  win: Window = window,
  nav: Navigator = navigator,
): TierHints {
  const n = nav as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  return {
    prefersReducedMotion,
    saveData: n.connection?.saveData === true,
    deviceMemory: n.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    coarsePointer: win.matchMedia("(pointer: coarse)").matches,
    viewportWidth: win.innerWidth,
    override: parseQualityOverride(win.location.search),
  };
}

/** EMA frame time above this (25 ms) counts as a slow frame. */
export const SLOW_FRAME_SECONDS = 1 / 40;
/** Consecutive slow frames (by EMA) before RICH falls to LITE. */
export const SLOW_FRAME_LIMIT = 90;
const EMA_WEIGHT = 0.05;

/**
 * Frame-time governor. Feed it every frame's delta (seconds); it demotes RICH
 * to LITE once the EMA stays above {@link SLOW_FRAME_SECONDS} for
 * {@link SLOW_FRAME_LIMIT} frames. There is no automatic re-promotion: fast
 * frames after a demotion keep LITE, so the tier cannot oscillate.
 */
export class TierController {
  private ema = 1 / 60;
  private slowFrames = 0;

  constructor(private current: QualityTier) {}

  get tier(): QualityTier {
    return this.current;
  }

  /** Returns the new tier if this frame demoted, otherwise `null`. */
  update(delta: number): QualityTier | null {
    if (this.current === "lite") return null;
    this.ema = this.ema * (1 - EMA_WEIGHT) + delta * EMA_WEIGHT;
    this.slowFrames = this.ema > SLOW_FRAME_SECONDS ? this.slowFrames + 1 : 0;
    if (this.slowFrames < SLOW_FRAME_LIMIT) return null;
    this.current = "lite";
    return this.current;
  }

  /** Explicit choice (Lab Mode toggle, reduced motion). Resets the governor. */
  set(tier: QualityTier): void {
    this.current = tier;
    this.ema = 1 / 60;
    this.slowFrames = 0;
  }
}
