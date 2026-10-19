import { announce } from "./announcer";
import { LAB_TEMP_MAX_C, LAB_TEMP_MIN_C } from "../snowflake/nakaya";
import { SEED_PATTERN } from "../url-state";
import { SHARE_PARAM_SEED } from "../share-url-params";
import type { QualityTier } from "../snowflake/quality";

/**
 * A pasted share link yields its `?seed=`; anything else is the raw text.
 * Always trimmed and lowercased. Only http(s) URLs are read as links, so
 * `javascript:` and other schemes fall through to SEED_PATTERN and are rejected.
 */
export function normalizeSeedInput(raw: string): string {
  const text = (raw || "").trim();
  try {
    const url = new URL(text);
    if (url.protocol === "http:" || url.protocol === "https:") {
      const fromUrl = url.searchParams.get(SHARE_PARAM_SEED);
      if (fromUrl !== null) return fromUrl.trim().toLowerCase();
    }
  } catch {
    // Not a parseable URL; fall through and let SEED_PATTERN reject it.
  }
  return text.toLowerCase();
}

export type TweakpanePane = import("tweakpane").Pane;

export interface LabPanelParams {
  seed: string;
  temperature: number;
  temperatureF: number;
  supersaturation: number;
  habit: string;
  /** Debug quality tier (`?quality=` equivalent). Never part of a share link. */
  quality: QualityTier;
}

export interface LabPanelCallbacks {
  onSeedChange: (seed: string) => void;
  onRandomizeSeed: () => void;
  onConditionsChange: (temp: number, ss: number, last?: boolean) => void;
  getCurrentSeedLabel: () => string;
  /** Active tier, read when the pane opens. */
  getQualityTier?: () => QualityTier;
  /** Returns the tier actually applied (reduced motion keeps LITE). */
  onQualityChange?: (tier: QualityTier) => QualityTier;
}

export class LabPanel {
  public params: LabPanelParams = {
    seed: "····",
    temperature: -15,
    temperatureF: 5,
    supersaturation: 80,
    habit: "—",
    quality: "rich",
  };

  private pane: TweakpanePane | null = null;
  /**
   * > 0 while syncing the pane from app state. Tweakpane's `refresh()` re-emits
   * `change` with `last === true`; that is not a slider release, so it is passed
   * on as `last: false` (a Nakaya drag must not flush its throttled URL write).
   */
  private refreshDepth = 0;
  private panePromise: Promise<TweakpanePane> | null = null;
  private callbacks: LabPanelCallbacks;

  constructor(callbacks: LabPanelCallbacks) {
    this.callbacks = callbacks;
  }

  public async ensurePane(): Promise<TweakpanePane> {
    if (this.pane) return this.pane;
    if (this.panePromise) return this.panePromise;

    const promise = import("tweakpane").then(({ Pane }) => {
      const paneContainer = document.getElementById("pane-mount");
      const p = new Pane({
        container: paneContainer ?? undefined,
        title: "Growth parameters",
      });

      p.addBinding(this.params, "seed", {
        label: "Seed",
      }).on("change", (ev) => {
        const val = normalizeSeedInput(ev.value);
        const currentSeedLabel = this.callbacks.getCurrentSeedLabel();
        if (val === currentSeedLabel) return;

        if (SEED_PATTERN.test(val)) {
          this.callbacks.onSeedChange(val);
        } else {
          announce("Invalid seed. Seeds must be 3 to 12 alphanumeric characters.");

          // Direct inline visual error feedback for Tweakpane's Seed input.
          // #btn-seed is the header "Copy share link" control, not this field.
          const labelViews = document.querySelectorAll(".tp-lblv");
          let seedInputEl: HTMLInputElement | null = null;
          for (const lv of labelViews) {
            if (lv.textContent?.toLowerCase().includes("seed")) {
              seedInputEl = lv.querySelector("input") as HTMLInputElement;
              break;
            }
          }
          if (seedInputEl) {
            seedInputEl.style.outline = "2px solid #ff6b6b";
            seedInputEl.style.outlineOffset = "2px";
            seedInputEl.style.transition = "outline 0.2s ease, background-color 0.2s ease";
            seedInputEl.style.backgroundColor = "rgba(255, 107, 107, 0.15)";
            setTimeout(() => {
              if (seedInputEl) {
                seedInputEl.style.outline = "";
                seedInputEl.style.outlineOffset = "";
                seedInputEl.style.transition = "";
                seedInputEl.style.backgroundColor = "";
              }
            }, 1500);
          }

          this.params.seed = currentSeedLabel;
          this.refresh();
        }
      });

      p.addButton({
        title: "Randomize Seed",
      }).on("click", () => {
        this.callbacks.onRandomizeSeed();
      });

      p.addBinding(this.params, "temperature", {
        min: LAB_TEMP_MIN_C,
        max: LAB_TEMP_MAX_C,
        step: 0.5,
        label: "Temp (°C)",
      }).on("change", (ev) => {
        this.callbacks.onConditionsChange(
          this.params.temperature,
          this.params.supersaturation,
          ev.last && this.refreshDepth === 0,
        );
      });

      p.addBinding(this.params, "temperatureF", {
        readonly: true,
        label: "Temp (°F)",
      });

      p.addBinding(this.params, "supersaturation", {
        min: 0,
        max: 100,
        step: 1,
        label: "Humidity (%)",
      }).on("change", (ev) => {
        this.callbacks.onConditionsChange(
          this.params.temperature,
          this.params.supersaturation,
          ev.last && this.refreshDepth === 0,
        );
      });

      p.addBinding(this.params, "habit", { readonly: true, label: "Habit" });

      if (this.callbacks.onQualityChange) {
        this.params.quality = this.callbacks.getQualityTier?.() ?? this.params.quality;
        p.addBinding(this.params, "quality", {
          label: "Quality",
          options: { RICH: "rich", LITE: "lite" },
        }).on("change", (ev) => {
          if (this.refreshDepth > 0) return;
          const applied = this.callbacks.onQualityChange?.(ev.value as QualityTier);
          if (applied && applied !== ev.value) this.syncQuality(applied);
        });
      }

      this.pane = p;
      return p;
    });

    this.panePromise = promise;
    promise.catch(() => {
      // Allow a later call (e.g. re-opening Lab Mode) to retry instead of
      // permanently replaying this rejection after a transient failure
      // (network hiccup, ad blocker, etc.).
      if (this.panePromise === promise) this.panePromise = null;
    });

    return this.panePromise;
  }

  public syncParams(seed: string, habit: string, tempC: number, ssPercent: number): void {
    this.params.seed = seed;
    this.params.habit = habit;
    this.params.temperature = tempC;
    this.params.temperatureF = (tempC * 9) / 5 + 32;
    this.params.supersaturation = ssPercent;
    this.refresh();
  }

  /** Show the active tier (it can fall on its own while the pane is open). */
  public syncQuality(tier: QualityTier): void {
    this.params.quality = tier;
    this.refresh();
  }

  public refresh(): void {
    this.refreshDepth++;
    try {
      this.pane?.refresh();
    } finally {
      this.refreshDepth--;
    }
  }

  public isLoaded(): boolean {
    return this.pane !== null;
  }
}
