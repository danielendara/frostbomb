import { visualPress } from "./feedback";
import { testTimeoutOverride } from "./test-timeout";
import { announce } from "./announcer";
import { SEED_PATTERN } from "../url-state";

export const STORAGE_KEY = "frostbomb-recent-seeds";
/** Unkept seeds shown in Recent Seeds; the oldest unkept seed rolls off past this. */
export const RECENT_CAP = 5;
/** Kept seeds never roll off, but only this many can be kept at once. */
export const KEPT_CAP = 12;

export interface SeedEntry {
  seed: string;
  kept: boolean;
}

/**
 * Stored shape: newest-first array. An unkept seed is a plain string (the
 * original format, so existing data loads unchanged); a kept seed is
 * `{ seed, kept: true }`. Invalid entries are dropped using SEED_PATTERN.
 */
type StoredEntry = string | { seed: string; kept: true };

export function parseStoredEntries(value: unknown): SeedEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: SeedEntry[] = [];
  for (const item of value) {
    const entry: SeedEntry | null =
      typeof item === "string"
        ? { seed: item, kept: false }
        : item && typeof item === "object" && typeof item.seed === "string"
          ? { seed: item.seed, kept: item.kept === true }
          : null;
    if (!entry || !SEED_PATTERN.test(entry.seed)) continue;
    if (entries.some((e) => e.seed === entry.seed)) continue;
    entries.push(entry);
  }
  return applyCaps(entries);
}

export function serializeEntries(entries: readonly SeedEntry[]): StoredEntry[] {
  return entries.map((e) => (e.kept ? { seed: e.seed, kept: true } : e.seed));
}

/** Keep the newest RECENT_CAP unkept and KEPT_CAP kept seeds, preserving order. */
function applyCaps(entries: readonly SeedEntry[]): SeedEntry[] {
  let unkept = 0;
  let kept = 0;
  return entries.filter((e) => (e.kept ? ++kept <= KEPT_CAP : ++unkept <= RECENT_CAP));
}

/** Move/insert `seed` to the front (keeping its Keep state), then apply the caps. */
export function withSeedAdded(entries: readonly SeedEntry[], seed: string): SeedEntry[] {
  const existing = entries.find((e) => e.seed === seed);
  return applyCaps([
    { seed, kept: existing?.kept ?? false },
    ...entries.filter((e) => e.seed !== seed),
  ]);
}

export interface HistoryManagerOptions {
  onSelectSeed: (seed: string) => void;
  /** Called after another tab changed the stored list and entries were replaced. */
  onExternalChange?: () => void;
}

export class SeedHistoryManager {
  private entries: SeedEntry[] = [];
  private backupEntries: SeedEntry[] | null = null;
  private undoTimeoutId: number | null = null;
  private onSelectSeed: (seed: string) => void;
  private onExternalChange: (() => void) | undefined;

  // Change detection cache to prevent layout thrashing
  private lastActiveSeed: string | undefined = undefined;
  private lastSeedsStr: string | undefined = undefined;
  private lastIsLabMode: boolean | undefined = undefined;
  private lastIsGuideOpen: boolean | undefined = undefined;
  private lastHasBackup: boolean | undefined = undefined;

  constructor(options: HistoryManagerOptions) {
    this.onSelectSeed = options.onSelectSeed;
    this.onExternalChange = options.onExternalChange;
    this.loadFromStorage();
    window.addEventListener("storage", (e) => this.handleStorageEvent(e));
  }

  /** Adopt another tab's list so this tab never overwrites it with a stale one. Never writes. */
  private handleStorageEvent(e: StorageEvent): void {
    if (e.storageArea !== localStorage) return;
    if (e.key !== STORAGE_KEY && e.key !== null) return;
    // Keep a pending undo intact; the list is re-read when the window closes.
    if (this.undoTimeoutId !== null || this.backupEntries !== null) return;
    try {
      this.entries = e.newValue ? parseStoredEntries(JSON.parse(e.newValue)) : [];
    } catch (err) {
      console.warn("Failed to sync recent seeds from another tab:", err);
      return;
    }
    this.onExternalChange?.();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      this.entries = stored ? parseStoredEntries(JSON.parse(stored)) : [];
    } catch (e) {
      console.warn("Failed to parse recent seeds from localStorage:", e);
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeEntries(this.entries)));
    } catch (e) {
      console.warn("Failed to save recent seeds to localStorage:", e);
    }
  }

  public getSeeds(): string[] {
    return this.entries.map((e) => e.seed);
  }

  public getKeptSeeds(): string[] {
    return this.entries.filter((e) => e.kept).map((e) => e.seed);
  }

  /**
   * Toggle Keep on a listed seed. Never regrows or touches the URL. Unkeeping
   * doesn't trim immediately (so a misclick can be re-kept); the recent cap
   * applies again on the next added seed or reload. Returns false when the seed
   * isn't listed or the kept cap is full (announced).
   */
  public setKept(seedVal: string, kept: boolean): boolean {
    const entry = this.entries.find((e) => e.seed === seedVal);
    if (!entry) return false;
    if (entry.kept === kept) return true;
    if (kept && this.getKeptSeeds().length >= KEPT_CAP) {
      announce(`You can keep up to ${KEPT_CAP} seeds. Unkeep one to keep ${seedVal}.`);
      return false;
    }
    this.entries = this.entries.map((e) => (e.seed === seedVal ? { ...e, kept } : e));
    this.saveToStorage();
    announce(kept ? `Kept seed ${seedVal}` : `Seed ${seedVal} is no longer kept`);
    return true;
  }

  public addSeed(seedVal: string): void {
    if (!seedVal || !SEED_PATTERN.test(seedVal)) return;

    // Lab/Nakaya grow(keepSeed) during the undo window would otherwise miss the
    // newest-seed guard (clear emptied the unkept seeds) and clobber the backup.
    if (this.undoTimeoutId !== null || this.backupEntries !== null) {
      return;
    }

    // Performance optimization: prevent redundant localStorage/DOM writes if seed is already newest
    if (this.entries[0]?.seed === seedVal) {
      return;
    }

    this.entries = withSeedAdded(this.entries, seedVal);
    this.saveToStorage();
  }

  /** Clears unkept seeds only; kept seeds stay listed. Undo restores exactly what was cleared. */
  public clear(currentSeedLabel: string, isLabMode: boolean, isGuideOpen: boolean): void {
    if (!this.entries.some((e) => !e.kept)) return;

    if (this.undoTimeoutId !== null) {
      clearTimeout(this.undoTimeoutId);
      this.undoTimeoutId = null;
    }

    this.backupEntries = [...this.entries];
    this.entries = this.entries.filter((e) => e.kept);
    if (this.entries.length > 0) {
      this.saveToStorage();
    } else {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.warn("Failed to remove recent seeds from localStorage:", e);
      }
    }

    this.updateUI(currentSeedLabel, isLabMode, isGuideOpen);
    announce("Recent seeds history cleared. You can undo this action.");

    requestAnimationFrame(() => {
      const undoBtn = document.getElementById("btn-undo-history");
      if (undoBtn) {
        undoBtn.focus();
      } else {
        const focusTarget = document.getElementById("guide-toggle");
        if (focusTarget) {
          focusTarget.focus();
        }
      }
    });

    const timeoutDuration = testTimeoutOverride("__FROSTBOMB_UNDO_TIMEOUT__", 10000);

    this.undoTimeoutId = window.setTimeout(() => {
      const undoWasFocused = document.activeElement?.id === "btn-undo-history";
      this.backupEntries = null;
      this.undoTimeoutId = null;
      // Events were ignored during the window; re-read so the next write isn't stale.
      this.loadFromStorage();
      this.onExternalChange?.();
      this.updateUI(currentSeedLabel, isLabMode, isGuideOpen);
      if (undoWasFocused) {
        document.getElementById("guide-toggle")?.focus();
      }
    }, timeoutDuration);
  }

  public undoClear(currentSeedLabel: string, isLabMode: boolean, isGuideOpen: boolean): void {
    // Put the cleared seeds back in their old places; seeds still listed keep
    // any Keep change made during the undo window.
    const current = this.entries;
    this.entries = (this.backupEntries ?? current).map(
      (e) => current.find((c) => c.seed === e.seed) ?? e,
    );
    this.backupEntries = null;
    if (this.undoTimeoutId !== null) {
      clearTimeout(this.undoTimeoutId);
      this.undoTimeoutId = null;
    }
    this.saveToStorage();
    this.updateUI(currentSeedLabel, isLabMode, isGuideOpen);
    announce("Recent seeds history restored");

    setTimeout(() => {
      document.getElementById("btn-clear-history")?.focus();
    }, 50);
  }

  private setClearButtonAvailable(available: boolean): void {
    const clearBtn = document.getElementById("btn-clear-history");
    if (!(clearBtn instanceof HTMLButtonElement)) return;

    clearBtn.hidden = !available;
    clearBtn.disabled = !available;

    if (!available) return;

    const count = this.entries.filter((e) => !e.kept).length;
    const itemLabel = `${count} item${count === 1 ? "" : "s"}`;
    clearBtn.textContent = `Clear (${count})`;
    clearBtn.title = `Clear seed history (${itemLabel})`;
    clearBtn.setAttribute("aria-label", `Clear seed history (${itemLabel})`);
  }

  public updateUI(currentSeedLabel: string, isLabMode: boolean, isGuideOpen: boolean): void {
    const container = document.getElementById("recent-seeds-container");
    const listEl = document.getElementById("recent-seeds-list");
    if (!container || !listEl) return;

    const seedsStr = this.entries.map((e) => (e.kept ? `${e.seed}*` : e.seed)).join(",");
    const hasBackup = this.backupEntries !== null;
    if (
      this.lastActiveSeed === currentSeedLabel &&
      this.lastSeedsStr === seedsStr &&
      this.lastIsLabMode === isLabMode &&
      this.lastIsGuideOpen === isGuideOpen &&
      this.lastHasBackup === hasBackup
    ) {
      return;
    }

    this.lastActiveSeed = currentSeedLabel;
    this.lastSeedsStr = seedsStr;
    this.lastIsLabMode = isLabMode;
    this.lastIsGuideOpen = isGuideOpen;
    this.lastHasBackup = hasBackup;

    if (isGuideOpen || isLabMode) {
      container.classList.remove("undo-armed");
      container.style.display = "none";
      return;
    }

    if (this.entries.length === 0 && !hasBackup) {
      this.setClearButtonAvailable(false);
      container.classList.remove("undo-armed");
      container.style.display = "none";
      listEl.innerHTML = "";
      return;
    }

    container.classList.toggle("undo-armed", hasBackup);
    container.style.display = "flex";
    listEl.innerHTML = "";
    this.setClearButtonAvailable(!hasBackup && this.entries.some((e) => !e.kept));

    const activeIndex = this.entries.findIndex((e) => e.seed === currentSeedLabel);
    const primaryIndex = activeIndex !== -1 ? activeIndex : 0;

    this.entries.forEach(({ seed: seedVal, kept }) => {
      const chip = document.createElement("span");
      chip.className = "seed-chip";

      const btn = document.createElement("button");
      const isActive = seedVal === currentSeedLabel;
      btn.className = [
        "seed-btn",
        "seed-pill",
        kept ? "is-kept" : "",
        isActive ? "is-active" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const tooltipText = `Grow seed ${seedVal}${kept ? " (kept)" : ""}${isActive ? " (currently active)" : ""}`;
      btn.setAttribute("aria-label", tooltipText);
      btn.setAttribute("aria-current", isActive ? "true" : "false");
      btn.title = tooltipText;
      btn.textContent = seedVal;

      btn.addEventListener("click", () => {
        visualPress(btn);
        this.onSelectSeed(seedVal);
      });

      // Star shape (filled vs outline) marks kept seeds without relying on color.
      const keepBtn = document.createElement("button");
      keepBtn.type = "button";
      keepBtn.className = "seed-keep";
      keepBtn.dataset.seed = seedVal;
      keepBtn.textContent = kept ? "★" : "☆";
      keepBtn.setAttribute("aria-label", `Keep ${seedVal}`);
      keepBtn.setAttribute("aria-pressed", kept ? "true" : "false");
      keepBtn.title = kept ? `Kept — ${seedVal} won't roll off` : `Keep ${seedVal} so it doesn't roll off`;
      keepBtn.addEventListener("click", () => {
        visualPress(keepBtn);
        if (!this.setKept(seedVal, !kept)) return;
        this.updateUI(currentSeedLabel, isLabMode, isGuideOpen);
        const again = Array.from(listEl.querySelectorAll<HTMLButtonElement>("button.seed-keep")).find(
          (b) => b.dataset.seed === seedVal,
        );
        again?.focus();
      });

      chip.appendChild(btn);
      chip.appendChild(keepBtn);
      listEl.appendChild(chip);
    });

    if (hasBackup) {
      const infoSpan = document.createElement("span");
      infoSpan.className = "undo-banner";
      infoSpan.textContent = "History cleared. ";

      const undoBtn = document.createElement("button");
      undoBtn.id = "btn-undo-history";
      undoBtn.className = "seed-btn undo-armed";
      undoBtn.title = "Undo clearing seed history";
      undoBtn.setAttribute("aria-label", "Undo clearing seed history");
      undoBtn.textContent = "undo";

      undoBtn.addEventListener("click", () => {
        visualPress(undoBtn);
        this.undoClear(currentSeedLabel, isLabMode, isGuideOpen);
      });

      listEl.appendChild(infoSpan);
      listEl.appendChild(undoBtn);
    }

    // Roving tabindex by chip: arrows move pill→pill or toggle→toggle, and the
    // roving chip's pill and Keep toggle are the two tab stops. Undo keeps its own.
    const chips = Array.from(listEl.querySelectorAll<HTMLElement>(".seed-chip")).map((chip) => [
      chip.querySelector<HTMLButtonElement>("button.seed-pill")!,
      chip.querySelector<HTMLButtonElement>("button.seed-keep")!,
    ]);
    const setRovingChip = (k: number) => {
      chips.forEach((pair, n) => pair.forEach((b) => b.setAttribute("tabindex", n === k ? "0" : "-1")));
    };
    setRovingChip(primaryIndex);

    chips.forEach((pair, k) => {
      pair.forEach((b, column) => {
        b.addEventListener("focus", () => setRovingChip(k));
        b.addEventListener("keydown", (e: KeyboardEvent) => {
          let nextIdx: number | null = null;
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            nextIdx = (k + 1) % chips.length;
          } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            nextIdx = (k - 1 + chips.length) % chips.length;
          }

          if (nextIdx !== null) {
            e.preventDefault();
            e.stopPropagation();
            chips[nextIdx][column].focus();
            setRovingChip(nextIdx);
          }
        });
      });
    });
  }
}
