import { announce } from "./announcer";
import { SEED_PATTERN } from "../url-state";

export type TweakpanePane = import("tweakpane").Pane;

export interface LabPanelParams {
  seed: string;
  temperature: number;
  temperatureF: number;
  supersaturation: number;
  habit: string;
}

export interface LabPanelCallbacks {
  onSeedChange: (seed: string) => void;
  onRandomizeSeed: () => void;
  onConditionsChange: (temp: number, ss: number) => void;
  getCurrentSeedLabel: () => string;
}

export class LabPanel {
  public params: LabPanelParams = {
    seed: "····",
    temperature: -15,
    temperatureF: 5,
    supersaturation: 80,
    habit: "—",
  };

  private pane: TweakpanePane | null = null;
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
        const val = (ev.value || "").trim().toLowerCase();
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
          p.refresh();
        }
      });

      p.addButton({
        title: "Randomize Seed",
      }).on("click", () => {
        this.callbacks.onRandomizeSeed();
      });

      p.addBinding(this.params, "temperature", {
        min: -40,
        max: 0,
        step: 0.5,
        label: "Temp (°C)",
      }).on("change", () => {
        this.callbacks.onConditionsChange(this.params.temperature, this.params.supersaturation);
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
      }).on("change", () => {
        this.callbacks.onConditionsChange(this.params.temperature, this.params.supersaturation);
      });

      p.addBinding(this.params, "habit", { readonly: true, label: "Habit" });

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
    this.pane?.refresh();
  }

  public refresh(): void {
    this.pane?.refresh();
  }

  public isLoaded(): boolean {
    return this.pane !== null;
  }
}
