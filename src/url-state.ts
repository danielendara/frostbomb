import {
  SHARE_PARAM_LAB,
  SHARE_PARAM_PINK,
  SHARE_PARAM_PRISM,
  SHARE_PARAM_ROTATE,
  SHARE_PARAM_SEED,
  readShareFlag,
  type ShareFlagName,
  type ShareFlagTriState,
} from "./share-url-params";
import type { ModePrefs } from "./mode-prefs";
import { LAB_TEMP_MAX_C, LAB_TEMP_MIN_C } from "./snowflake/nakaya";

export interface LabConditionsState {
  temperatureC: number;
  /** 0–1, as the growth model wants it (the URL carries whole percent). */
  supersaturation: number;
}

/**
 * How the crystal was grown.
 *
 * - `sampled`: seed RNG builds the atmospheric path, then geometry consumes
 *   what remains. The URL omits `t`/`ss`.
 * - `manual`: an explicit Lab point. One-point path, habit from that point,
 *   fresh RNG. Old `t`/`ss` links stay on this path.
 */
export type GenerationProvenance = "sampled" | "manual";

/** `null` = the param was absent, so the stored preference decides. */
interface ModeState {
  pink: boolean | null;
  prism: boolean | null;
  lab: boolean | null;
  rotate: boolean | null;
}

export interface CrystalUrlState {
  /** Lowercased, validated seed label, or null when absent/unusable. */
  seed: string | null;
  /**
   * `manual` only when `lab` is present. A displayed condition pair is not
   * enough — sampled crystals keep this `sampled` so reopen replays the path.
   */
  provenance: GenerationProvenance;
  /** Lab temperature/supersaturation, or null when absent or out of range. */
  lab: LabConditionsState | null;
  modes: ModeState;
}

export const SEED_PATTERN = /^[a-z0-9]{3,12}$/i;

function parseSeed(raw: string | null): string | null {
  return raw && SEED_PATTERN.test(raw) ? raw.toLowerCase() : null;
}

const PLAIN_DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)$/;

function parseLab(tRaw: string | null, ssRaw: string | null): LabConditionsState | null {
  if (tRaw === null || ssRaw === null) return null;
  // Number("") and Number(" ") are 0, and Number("0x0") is 0; only plain decimals count.
  if (!PLAIN_DECIMAL.test(tRaw) || !PLAIN_DECIMAL.test(ssRaw)) return null;
  const temperatureC = Number(tRaw);
  const ssPercent = Number(ssRaw);
  if (!Number.isFinite(temperatureC) || !Number.isFinite(ssPercent)) return null;
  if (temperatureC < LAB_TEMP_MIN_C || temperatureC > LAB_TEMP_MAX_C) return null;
  if (ssPercent < 0 || ssPercent > 100) return null;
  return { temperatureC, supersaturation: ssPercent / 100 };
}

/** Present means the URL decides; `=1` is on and anything else is off. */
function parseMode(params: URLSearchParams, name: ShareFlagName): boolean | null {
  const flag = readShareFlag(params, name);
  return flag === null ? null : flag === "1";
}

export function parseCrystalUrlState(search: string): CrystalUrlState {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    params = new URLSearchParams();
  }
  const lab = parseLab(params.get("t"), params.get("ss"));
  return {
    seed: parseSeed(params.get(SHARE_PARAM_SEED)),
    provenance: lab ? "manual" : "sampled",
    lab,
    modes: {
      pink: parseMode(params, SHARE_PARAM_PINK),
      prism: parseMode(params, SHARE_PARAM_PRISM),
      lab: parseMode(params, SHARE_PARAM_LAB),
      rotate: parseMode(params, SHARE_PARAM_ROTATE),
    },
  };
}

/** Where a set of look modes is being applied from. */
export type ModeSource = "boot" | "restore";

/** The look modes that share links encode by absence when off. */
export interface LookModes {
  pink: boolean;
  prism: boolean;
}

/**
 * The Pink/Prism state to apply, as a target value (never a flip).
 *
 * A present param always decides. Only an absent one differs by source:
 *
 * - `boot`: no opinion, so the remembered preference decides — a plain revisit
 *   restores last visit's look.
 * - `restore`: the popped entry is authoritative. `syncCrystalUrl` writes the
 *   full look and Pink/Prism are omitted when off, so absent means off; falling
 *   back to the preference would resolve it from the look currently on screen.
 */
export function resolveModes(
  source: ModeSource,
  params: URLSearchParams,
  stored: Pick<ModePrefs, "pink" | "prism">,
): LookModes {
  return {
    pink: resolveLookMode(source, readShareFlag(params, SHARE_PARAM_PINK), stored.pink),
    prism: resolveLookMode(source, readShareFlag(params, SHARE_PARAM_PRISM), stored.prism),
  };
}

function resolveLookMode(
  source: ModeSource,
  flag: ShareFlagTriState,
  storedOn: boolean,
): boolean {
  if (flag !== null) return flag === "1";
  return source === "boot" ? storedOn : false;
}

/** URL precision: 0.1 °C and whole-percent supersaturation. */
export function quantizeLabConditions(conditions: LabConditionsState): LabConditionsState {
  const ssPercent = Math.round(conditions.supersaturation * 100);
  return {
    temperatureC: Number(conditions.temperatureC.toFixed(1)),
    supersaturation: ssPercent / 100,
  };
}

/** The `t`/`ss` formula — one place, not five. */
export function setLabConditionsParams(params: URLSearchParams, conditions: LabConditionsState) {
  const quantized = quantizeLabConditions(conditions);
  params.set("t", quantized.temperatureC.toFixed(1));
  params.set("ss", Math.round(quantized.supersaturation * 100).toString());
}

/**
 * Serialize generation provenance. Sampled crystals drop `t`/`ss` so a copied
 * link and a history entry replay `sampleConditions`. Manual Lab writes the
 * fixed point. Passing a displayed pair with `sampled` does not turn it into
 * a Lab link.
 */
export function writeCrystalGeneration(
  params: URLSearchParams,
  provenance: GenerationProvenance,
  conditions: LabConditionsState | null,
): void {
  if (provenance === "manual" && conditions) {
    setLabConditionsParams(params, conditions);
    return;
  }
  params.delete("t");
  params.delete("ss");
}

/**
 * Seed changes may keep a manual fixed point (it round-trips through `t`/`ss`).
 * A sampled atmospheric path does not — callers must resample instead of
 * reusing it under the new seed.
 */
export function retainedLabConditions(
  provenance: GenerationProvenance,
  conditions: LabConditionsState | null,
): LabConditionsState | null {
  if (provenance !== "manual" || conditions === null) return null;
  return quantizeLabConditions(conditions);
}

export interface CrystalStatesEqualOptions {
  /** Matches applyModes restore: rotate from the URL is ignored under reduced motion. */
  reducedMotion?: boolean;
}

/**
 * Two states are equal when they describe the same crystal *and* the same
 * look — a popped entry that matches the current one must not regrow or
 * re-announce.
 *
 * Rotate is compared only when it is present in the popped URL (`a`). An absent
 * param is not authoritative on restore (stored prefs may differ on screen).
 */
export function crystalStatesEqual(
  a: CrystalUrlState,
  b: CrystalUrlState,
  options?: CrystalStatesEqualOptions,
): boolean {
  return (
    a.seed === b.seed &&
    a.provenance === b.provenance &&
    labEqual(a.lab, b.lab) &&
    (a.modes.pink ?? false) === (b.modes.pink ?? false) &&
    (a.modes.prism ?? false) === (b.modes.prism ?? false) &&
    (a.modes.lab ?? false) === (b.modes.lab ?? false) &&
    rotateStatesEqual(a.modes, b.modes, options)
  );
}

function rotateStatesEqual(
  popped: ModeState,
  onScreen: ModeState,
  options?: CrystalStatesEqualOptions,
): boolean {
  if (popped.rotate === null) return true;
  if (options?.reducedMotion) return true;
  return (popped.rotate ?? false) === (onScreen.rotate ?? false);
}

function labEqual(a: LabConditionsState | null, b: LabConditionsState | null): boolean {
  if (a === null || b === null) return a === b;
  // Compare at URL precision: 0.1 °C and whole-percent SS.
  return (
    a.temperatureC.toFixed(1) === b.temperatureC.toFixed(1) &&
    Math.round(a.supersaturation * 100) === Math.round(b.supersaturation * 100)
  );
}
