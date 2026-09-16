/**
 * One codec for the shareable crystal state (#316).
 *
 * Cold load, the share link, and `popstate` all parse and serialize through
 * here — that is what makes "the state a Back lands on is the state a share
 * link would produce" a testable claim rather than a hope.
 */

export interface LabConditionsState {
  temperatureC: number;
  /** 0–1, as the growth model wants it (the URL carries whole percent). */
  supersaturation: number;
}

/** `null` = the param was absent, so the stored preference decides. */
export interface ModeState {
  pink: boolean | null;
  prism: boolean | null;
  lab: boolean | null;
  rotate: boolean | null;
}

export interface CrystalUrlState {
  /** Lowercased, validated seed label, or null when absent/unusable. */
  seed: string | null;
  /** Lab temperature/supersaturation, or null when absent or out of range. */
  lab: LabConditionsState | null;
  modes: ModeState;
}

export const SEED_PATTERN = /^[a-z0-9]{3,12}$/i;

/** Lab temperatures live on the Nakaya diagram: −40 °C to 0 °C, 0–100 % SS. */
export const MIN_TEMPERATURE_C = -40;
export const MAX_TEMPERATURE_C = 0;

function parseSeed(raw: string | null): string | null {
  return raw && SEED_PATTERN.test(raw) ? raw.toLowerCase() : null;
}

function parseLab(tRaw: string | null, ssRaw: string | null): LabConditionsState | null {
  if (tRaw === null || ssRaw === null) return null;
  const temperatureC = Number(tRaw);
  const ssPercent = Number(ssRaw);
  if (!Number.isFinite(temperatureC) || !Number.isFinite(ssPercent)) return null;
  if (temperatureC < MIN_TEMPERATURE_C || temperatureC > MAX_TEMPERATURE_C) return null;
  if (ssPercent < 0 || ssPercent > 100) return null;
  return { temperatureC, supersaturation: ssPercent / 100 };
}

/** Present means the URL decides; `=1` is on and anything else is off. */
function parseMode(raw: string | null): boolean | null {
  return raw === null ? null : raw === "1";
}

export function parseCrystalUrlState(search: string): CrystalUrlState {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    params = new URLSearchParams();
  }
  return {
    seed: parseSeed(params.get("seed")),
    lab: parseLab(params.get("t"), params.get("ss")),
    modes: {
      pink: parseMode(params.get("pink")),
      prism: parseMode(params.get("prism")),
      lab: parseMode(params.get("lab")),
      rotate: parseMode(params.get("rotate")),
    },
  };
}

/** The `t`/`ss` formula — one place, not five. */
export function setLabConditionsParams(params: URLSearchParams, conditions: LabConditionsState) {
  params.set("t", conditions.temperatureC.toFixed(1));
  params.set("ss", Math.round(conditions.supersaturation * 100).toString());
}

/**
 * Two states are equal when they describe the same crystal *and* the same
 * look — a popped entry that matches the current one must not regrow or
 * re-announce.
 */
export function crystalStatesEqual(a: CrystalUrlState, b: CrystalUrlState): boolean {
  return (
    a.seed === b.seed &&
    labEqual(a.lab, b.lab) &&
    a.modes.pink === b.modes.pink &&
    a.modes.prism === b.modes.prism &&
    a.modes.lab === b.modes.lab &&
    a.modes.rotate === b.modes.rotate
  );
}

function labEqual(a: LabConditionsState | null, b: LabConditionsState | null): boolean {
  if (a === null || b === null) return a === b;
  // Compare at URL precision: 0.1 °C and whole-percent SS.
  return (
    a.temperatureC.toFixed(1) === b.temperatureC.toFixed(1) &&
    Math.round(a.supersaturation * 100) === Math.round(b.supersaturation * 100)
  );
}
