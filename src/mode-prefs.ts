export const MODE_PREFS_KEY = "frostbomb-mode-prefs";

export interface ModePrefs {
  pink: boolean;
  prism: boolean;
  /** `undefined` = never explicitly toggled — default off. Explicit `true`/`false`
   * only get saved from toggleLabMode(), matching the rotate pref convention. */
  lab?: boolean;
  /** `undefined` = never explicitly toggled — leave the scene's own
   * `!prefersReducedMotion` construction-time default alone rather than
   * forcing a value. Explicit `true`/`false` only ever gets saved from
   * toggleAutoRotate(), which already refuses to run under reduced-motion,
   * so a stored value is always a genuine, reduced-motion-free choice. */
  rotate?: boolean;
}

/** Mirrors src/ui/history.ts's try/catch-and-warn localStorage pattern: a
 * blocked/quota-exceeded/private-mode write is silent, never thrown. */
export function saveModePrefs(prefs: ModePrefs): void {
  try {
    localStorage.setItem(MODE_PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.warn("Failed to save mode prefs to localStorage:", e);
  }
}

/** The user's rotate intent at setup (boot and restore), kept apart from the
 * live scene flag, which export/share pauses and reduced motion force off.
 * Reduced motion off: `?rotate=` value, else stored, else `true` (scene default).
 * Reduced motion on: stored only (may be `undefined`). */
export function resolveRotatePref(
  rotateParam: boolean | null,
  stored: boolean | undefined,
  reducedMotion: boolean,
): boolean | undefined {
  if (reducedMotion) return stored;
  return rotateParam ?? stored ?? true;
}

/** A blocked/missing/corrupt value all fall back to pink/prism/lab off and rotate unset
 * (today's default), same as before rotate prefs existed. */
export function loadModePrefs(): ModePrefs {
  try {
    const stored = localStorage.getItem(MODE_PREFS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object") {
        return {
          pink: parsed.pink === true,
          prism: parsed.prism === true,
          lab: typeof parsed.lab === "boolean" ? parsed.lab : undefined,
          rotate: typeof parsed.rotate === "boolean" ? parsed.rotate : undefined,
        };
      }
    }
  } catch (e) {
    console.warn("Failed to parse mode prefs from localStorage:", e);
  }
  return { pink: false, prism: false, lab: undefined, rotate: undefined };
}
