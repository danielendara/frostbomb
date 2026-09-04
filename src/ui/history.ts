import { visualPress } from "./feedback";
import { announce } from "./announcer";

export const STORAGE_KEY = "frostbomb-recent-seeds";

export interface HistoryManagerOptions {
  onSelectSeed: (seed: string) => void;
}

export class SeedHistoryManager {
  private recentSeeds: string[] = [];
  private backupRecentSeeds: string[] | null = null;
  private undoTimeoutId: number | null = null;
  private onSelectSeed: (seed: string) => void;

  // Change detection cache to prevent layout thrashing
  private lastActiveSeed: string | undefined = undefined;
  private lastSeedsStr: string | undefined = undefined;
  private lastIsLabMode: boolean | undefined = undefined;
  private lastIsGuideOpen: boolean | undefined = undefined;
  private lastHasBackup: boolean | undefined = undefined;

  constructor(options: HistoryManagerOptions) {
    this.onSelectSeed = options.onSelectSeed;
    this.loadFromStorage();
    this.initClearButton();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.recentSeeds = parsed
            .filter((s) => typeof s === "string" && /^[a-z0-9]{3,12}$/i.test(s))
            .slice(0, 5);
        }
      }
    } catch (e) {
      console.warn("Failed to parse recent seeds from localStorage:", e);
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.recentSeeds));
    } catch (e) {
      console.warn("Failed to save recent seeds to localStorage:", e);
    }
  }

  public getSeeds(): string[] {
    return [...this.recentSeeds];
  }

  public addSeed(seedVal: string): void {
    if (!seedVal || !/^[a-z0-9]{3,12}$/i.test(seedVal)) return;

    // Lab/Nakaya grow(keepSeed) during the undo window would otherwise miss the
    // newest-seed guard (clear emptied recentSeeds) and clobber the backup.
    if (this.undoTimeoutId !== null || this.backupRecentSeeds !== null) {
      return;
    }

    // Performance optimization: prevent redundant localStorage/DOM writes if seed is already newest
    if (this.recentSeeds[0] === seedVal) {
      return;
    }

    this.recentSeeds = [seedVal, ...this.recentSeeds.filter((s) => s !== seedVal)].slice(0, 5);
    this.saveToStorage();
  }

  public clear(currentSeedLabel: string, isLabMode: boolean, isGuideOpen: boolean): void {
    if (this.recentSeeds.length === 0) return;

    if (this.undoTimeoutId !== null) {
      clearTimeout(this.undoTimeoutId);
      this.undoTimeoutId = null;
    }

    this.backupRecentSeeds = [...this.recentSeeds];
    this.recentSeeds = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to remove recent seeds from localStorage:", e);
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

    const timeoutDuration =
      (window as any).__FROSTBOMB_UNDO_TIMEOUT__ !== undefined
        ? (window as any).__FROSTBOMB_UNDO_TIMEOUT__
        : 10000;

    this.undoTimeoutId = window.setTimeout(() => {
      this.backupRecentSeeds = null;
      this.undoTimeoutId = null;
      this.updateUI(currentSeedLabel, isLabMode, isGuideOpen);
      if (document.activeElement?.id === "btn-undo-history") {
        const focusTarget = document.getElementById("guide-toggle");
        if (focusTarget) {
          focusTarget.focus();
        }
      }
    }, timeoutDuration);
  }

  public undoClear(currentSeedLabel: string, isLabMode: boolean, isGuideOpen: boolean): void {
    this.recentSeeds = this.backupRecentSeeds || [];
    this.backupRecentSeeds = null;
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

  private initClearButton(): void {
    document.getElementById("btn-clear-history")?.addEventListener("click", () => {
      visualPress("btn-clear-history");
      // UI state will be supplied via updateUI calls
    });
  }

  private setClearButtonAvailable(available: boolean): void {
    const clearBtn = document.getElementById("btn-clear-history");
    if (!(clearBtn instanceof HTMLButtonElement)) return;

    clearBtn.hidden = !available;
    clearBtn.disabled = !available;

    if (!available) return;

    const count = this.recentSeeds.length;
    const itemLabel = `${count} item${count === 1 ? "" : "s"}`;
    clearBtn.textContent = `Clear (${count})`;
    clearBtn.title = `Clear seed history (${itemLabel})`;
    clearBtn.setAttribute("aria-label", `Clear seed history (${itemLabel})`);
  }

  public updateUI(currentSeedLabel: string, isLabMode: boolean, isGuideOpen: boolean): void {
    const container = document.getElementById("recent-seeds-container");
    const listEl = document.getElementById("recent-seeds-list");
    if (!container || !listEl) return;

    const seedsStr = this.recentSeeds.join(",");
    const hasBackup = this.backupRecentSeeds !== null;
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

    if (this.recentSeeds.length === 0) {
      if (this.backupRecentSeeds && this.backupRecentSeeds.length > 0) {
        this.setClearButtonAvailable(false);
        container.classList.add("undo-armed");
        container.style.display = "flex";
        listEl.innerHTML = "";

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
        return;
      }

      this.setClearButtonAvailable(false);
      container.classList.remove("undo-armed");
      container.style.display = "none";
      return;
    }

    container.classList.remove("undo-armed");
    container.style.display = "flex";
    listEl.innerHTML = "";
    this.setClearButtonAvailable(true);

    const activeIndex = this.recentSeeds.indexOf(currentSeedLabel);
    const primaryIndex = activeIndex !== -1 ? activeIndex : 0;

    this.recentSeeds.forEach((seedVal, i) => {
      const btn = document.createElement("button");
      btn.className = "seed-btn";
      btn.style.padding = "0.15rem 0.35rem";
      btn.style.fontSize = "0.65rem";
      btn.style.border = "1px solid var(--rule)";
      btn.style.borderRadius = "4px";
      const isActive = seedVal === currentSeedLabel;
      btn.style.background = isActive ? "rgba(158, 201, 255, 0.15)" : "transparent";
      btn.style.color = isActive ? "var(--accent)" : "var(--ink-dim)";
      btn.style.fontFamily = "var(--mono)";
      btn.style.cursor = "pointer";
      btn.style.textTransform = "lowercase";
      const tooltipText = `Grow seed ${seedVal}${isActive ? " (currently active)" : ""}`;
      btn.setAttribute("aria-label", tooltipText);
      btn.setAttribute("aria-current", isActive ? "true" : "false");
      btn.setAttribute("tabindex", i === primaryIndex ? "0" : "-1");
      btn.title = tooltipText;
      btn.textContent = seedVal;

      btn.addEventListener("focus", () => {
        const buttons = Array.from(listEl.querySelectorAll("button"));
        buttons.forEach((b) => {
          b.setAttribute("tabindex", b === btn ? "0" : "-1");
        });
      });

      if (!isActive) {
        btn.addEventListener("mouseenter", () => {
          btn.style.background = "rgba(230, 237, 245, 0.1)";
          btn.style.color = "var(--ink)";
        });
        btn.addEventListener("mouseleave", () => {
          btn.style.background = "transparent";
          btn.style.color = "var(--ink-dim)";
        });
        btn.addEventListener("focus", () => {
          btn.style.background = "rgba(230, 237, 245, 0.1)";
          btn.style.color = "var(--ink)";
        });
        btn.addEventListener("blur", () => {
          btn.style.background = "transparent";
          btn.style.color = "var(--ink-dim)";
        });
      }

      btn.addEventListener("keydown", (e: KeyboardEvent) => {
        const buttons = Array.from(listEl.querySelectorAll("button"));
        const idx = buttons.indexOf(btn);
        if (idx === -1) return;

        let nextIdx: number | null = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          nextIdx = (idx + 1) % buttons.length;
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          nextIdx = (idx - 1 + buttons.length) % buttons.length;
        }

        if (nextIdx !== null) {
          e.preventDefault();
          e.stopPropagation();
          buttons[nextIdx].focus();
          buttons.forEach((b, k) => {
            b.setAttribute("tabindex", k === nextIdx ? "0" : "-1");
          });
        }
      });

      btn.addEventListener("click", () => {
        visualPress(btn);
        this.onSelectSeed(seedVal);
      });

      listEl.appendChild(btn);
    });
  }
}
