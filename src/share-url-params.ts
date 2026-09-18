/**
 * Share-URL flag names and the encode/decode for `"1"` / `"0"` / absent.
 *
 * Pink/prism omit when off; lab/rotate write explicit `"0"`. On is always `"1"`.
 * A present value that is not `"1"` reads as `"0"` (off), matching boot.
 */

export const SHARE_PARAM_SEED = "seed";
export const SHARE_PARAM_PINK = "pink";
export const SHARE_PARAM_PRISM = "prism";
export const SHARE_PARAM_ROTATE = "rotate";
export const SHARE_PARAM_LAB = "lab";

export type ShareFlagName =
  | typeof SHARE_PARAM_PINK
  | typeof SHARE_PARAM_PRISM
  | typeof SHARE_PARAM_ROTATE
  | typeof SHARE_PARAM_LAB;

/** Present `"1"` / present-but-off / absent. */
export type ShareFlagTriState = "1" | "0" | null;

const WRITE_ZERO_WHEN_OFF: ReadonlySet<ShareFlagName> = new Set([
  SHARE_PARAM_LAB,
  SHARE_PARAM_ROTATE,
]);

export function setShareFlag(
  params: URLSearchParams,
  name: ShareFlagName,
  enabled: boolean,
): void {
  if (enabled) {
    params.set(name, "1");
    return;
  }
  if (WRITE_ZERO_WHEN_OFF.has(name)) {
    params.set(name, "0");
    return;
  }
  params.delete(name);
}

export function readShareFlag(
  params: URLSearchParams,
  name: ShareFlagName,
): ShareFlagTriState {
  const raw = params.get(name);
  if (raw === null) return null;
  return raw === "1" ? "1" : "0";
}
