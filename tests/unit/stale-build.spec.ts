import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STALE_BUILD_GUARD_KEY,
  STALE_BUILD_GUARD_WINDOW_MS,
  installStaleBuildRecovery,
  sessionStorageOrNull,
} from "../../src/ui/stale-build";

// Vite dispatches this on `window` (cancelable) when a dynamic import or its
// preloaded deps fail; it only throws the original error if nobody prevents it.
function preloadError(): Event {
  return new Event("vite:preloadError", { cancelable: true });
}

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, String(value));
    }),
  };
}

describe("installStaleBuildRecovery (#333)", () => {
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    uninstall = undefined;
  });

  afterEach(() => {
    uninstall?.();
    vi.restoreAllMocks();
  });

  it("reloads once on a vite:preloadError and prevents the default throw", () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    uninstall = installStaleBuildRecovery({ storage, reload, now: () => 1_000 });

    const event = preloadError();
    window.dispatchEvent(event);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    expect(storage.data.get(STALE_BUILD_GUARD_KEY)).toBe("1000");
  });

  it("does not reload again for a second event inside the guard window", () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    let clock = 1_000;
    uninstall = installStaleBuildRecovery({ storage, reload, now: () => clock });

    window.dispatchEvent(preloadError());
    expect(reload).toHaveBeenCalledTimes(1);

    clock += STALE_BUILD_GUARD_WINDOW_MS - 1;
    const second = preloadError();
    window.dispatchEvent(second);

    expect(reload).toHaveBeenCalledTimes(1);
    // Surfaces the original error to the existing failure UI instead.
    expect(second.defaultPrevented).toBe(false);
    expect(storage.data.get(STALE_BUILD_GUARD_KEY)).toBe("1000");
  });

  it("records the guard before it reloads, so a reload can never skip it", () => {
    const storage = fakeStorage();
    let recordedAtReload: string | undefined;
    const reload = vi.fn(() => {
      recordedAtReload = storage.data.get(STALE_BUILD_GUARD_KEY);
    });
    uninstall = installStaleBuildRecovery({ storage, reload, now: () => 5_000 });

    window.dispatchEvent(preloadError());

    expect(recordedAtReload).toBe("5000");
  });

  it("stays quiet on the reloaded page while the persisted guard is fresh", () => {
    // sessionStorage survives location.reload(): a second install (the new
    // page) sharing the same storage must see the earlier reload.
    const storage = fakeStorage();
    const firstPageReload = vi.fn();
    const first = installStaleBuildRecovery({
      storage,
      reload: firstPageReload,
      now: () => 10_000,
    });
    window.dispatchEvent(preloadError());
    first();
    expect(firstPageReload).toHaveBeenCalledTimes(1);

    const secondPageReload = vi.fn();
    uninstall = installStaleBuildRecovery({
      storage,
      reload: secondPageReload,
      now: () => 12_000,
    });
    const event = preloadError();
    window.dispatchEvent(event);

    expect(secondPageReload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("allows exactly one more reload once the guard window has passed", () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    let clock = 1_000;
    uninstall = installStaleBuildRecovery({ storage, reload, now: () => clock });

    window.dispatchEvent(preloadError());
    clock += STALE_BUILD_GUARD_WINDOW_MS;
    const later = preloadError();
    window.dispatchEvent(later);
    window.dispatchEvent(preloadError());

    expect(reload).toHaveBeenCalledTimes(2);
    expect(later.defaultPrevented).toBe(true);
    expect(storage.data.get(STALE_BUILD_GUARD_KEY)).toBe(String(clock));
  });

  it("treats an unreadable stored guard as no earlier reload", () => {
    const storage = fakeStorage({ [STALE_BUILD_GUARD_KEY]: "not-a-number" });
    const reload = vi.fn();
    uninstall = installStaleBuildRecovery({ storage, reload, now: () => 2_000 });

    window.dispatchEvent(preloadError());

    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.data.get(STALE_BUILD_GUARD_KEY)).toBe("2000");
  });

  it("treats a guard from the future (clock moved back) as recent, never reloads", () => {
    const storage = fakeStorage({ [STALE_BUILD_GUARD_KEY]: "900000" });
    const reload = vi.fn();
    uninstall = installStaleBuildRecovery({ storage, reload, now: () => 1_000 });

    const event = preloadError();
    window.dispatchEvent(event);

    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  describe("without a durable guard it must never reload", () => {
    it("does nothing when reading the guard throws", () => {
      const storage = fakeStorage();
      storage.getItem.mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });
      const reload = vi.fn();
      uninstall = installStaleBuildRecovery({ storage, reload, now: () => 1_000 });

      const event = preloadError();
      window.dispatchEvent(event);

      expect(reload).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it("does nothing when writing the guard throws (private mode / quota)", () => {
      const storage = fakeStorage();
      storage.setItem.mockImplementation(() => {
        throw new DOMException("full", "QuotaExceededError");
      });
      const reload = vi.fn();
      uninstall = installStaleBuildRecovery({ storage, reload, now: () => 1_000 });

      const first = preloadError();
      window.dispatchEvent(first);
      const second = preloadError();
      window.dispatchEvent(second);

      expect(reload).not.toHaveBeenCalled();
      expect(first.defaultPrevented).toBe(false);
      expect(second.defaultPrevented).toBe(false);
    });

    it("does nothing when there is no storage at all", () => {
      const reload = vi.fn();
      uninstall = installStaleBuildRecovery({ storage: null, reload, now: () => 1_000 });

      const event = preloadError();
      window.dispatchEvent(event);

      expect(reload).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });
  });

  it("does not prevent the default when the reload itself throws", () => {
    const storage = fakeStorage();
    const reload = vi.fn(() => {
      throw new Error("navigation blocked");
    });
    uninstall = installStaleBuildRecovery({ storage, reload, now: () => 1_000 });

    const event = preloadError();
    try {
      // Browsers report a throwing listener and carry on; happy-dom rethrows.
      window.dispatchEvent(event);
    } catch {
      /* the throw is the reload failing, asserted below */
    }

    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores events that are not vite:preloadError", () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    uninstall = installStaleBuildRecovery({ storage, reload, now: () => 1_000 });

    for (const type of ["unhandledrejection", "vite:beforeUpdate", "preloadError", "vite:preloaderror"]) {
      const event = new Event(type, { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }

    expect(reload).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("stops listening once uninstalled", () => {
    const reload = vi.fn();
    const stop = installStaleBuildRecovery({
      storage: fakeStorage(),
      reload,
      now: () => 1_000,
    });
    stop();

    window.dispatchEvent(preloadError());

    expect(reload).not.toHaveBeenCalled();
  });
});

describe("sessionStorageOrNull (#333)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns window.sessionStorage when it is available", () => {
    expect(sessionStorageOrNull()).toBe(window.sessionStorage);
  });

  it("returns null when merely touching sessionStorage throws (blocked site data)", () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(sessionStorageOrNull()).toBeNull();
  });
});
