/** sessionStorage key holding the time (ms) of the last stale-build reload. */
export const STALE_BUILD_GUARD_KEY = "frostbomb-stale-build-reload";

/** At most one recovery reload per this window; a second failure surfaces normally. */
export const STALE_BUILD_GUARD_WINDOW_MS = 60_000;

export type StaleBuildStorage = Pick<Storage, "getItem" | "setItem">;

export interface StaleBuildRecoveryDeps {
  /** Where the reload guard lives. `null` (unavailable) means "never reload". */
  storage: StaleBuildStorage | null;
  reload: () => void;
  now: () => number;
}

/** Merely reading `window.sessionStorage` throws when site data is blocked. */
export function sessionStorageOrNull(): StaleBuildStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Recovers a tab that predates a deploy (#333). Its hashed `/assets/*.js`
 * chunks are gone, so the first lazy import (Lab, 3D export, effects) fails;
 * Chromium also caches that failed fetch for the page's lifetime, so only a
 * fresh page load recovers. Vite dispatches a cancelable `vite:preloadError`
 * on `window` from the wrapper around every dynamic import in a production
 * build; unless it is prevented, the original error is thrown to the caller.
 *
 * Reloads once per guard window and keeps the current URL, so the seed and
 * look come back. The guard is written *before* the reload, and without a
 * working `sessionStorage` there is no reload at all: an in-memory flag would
 * reset with the page and loop. Every other case leaves the event alone so
 * the error reaches the existing failure UI. Returns an uninstall function.
 */
export function installStaleBuildRecovery({
  storage,
  reload,
  now,
}: StaleBuildRecoveryDeps): () => void {
  const onPreloadError = (event: Event): void => {
    if (!storage) return;
    const at = now();
    try {
      const raw = storage.getItem(STALE_BUILD_GUARD_KEY);
      const last = raw === null ? NaN : Number(raw);
      // A guard in the future (clock moved back) counts as recent: fail safe.
      if (Number.isFinite(last) && at - last < STALE_BUILD_GUARD_WINDOW_MS) return;
      storage.setItem(STALE_BUILD_GUARD_KEY, String(at));
    } catch {
      return;
    }
    reload();
    event.preventDefault();
  };
  window.addEventListener("vite:preloadError", onPreloadError);
  return () => window.removeEventListener("vite:preloadError", onPreloadError);
}
