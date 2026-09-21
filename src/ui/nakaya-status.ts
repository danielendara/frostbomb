import { getHabit, habitLabel, type GrowthConditions } from "../snowflake/nakaya";
import { quantizeLabConditions } from "../url-state";

export function updateNakayaStatus(temp: number, ss: number, isPreview: boolean): void {
  const statusEl = document.getElementById("nakaya-status");
  if (!statusEl) return;
  const habit = getHabit(temp, ss);
  const habitText = habitLabel[habit];
  const humPct = Math.round(ss * 100);
  const tempStr = temp.toFixed(1);
  if (isPreview) {
    statusEl.setAttribute("aria-live", "off");
    statusEl.innerHTML = `Preview: <span style="color: var(--accent);">${tempStr}°C</span>, <span style="color: var(--accent);">${humPct}%</span> • <em>${habitText}</em>`;
  } else {
    statusEl.setAttribute("aria-live", "polite");
    statusEl.innerHTML = `Active: <span style="color: var(--accent-hot);">${tempStr}°C</span>, <span style="color: var(--accent-hot);">${humPct}%</span> • <strong>${habitText}</strong>`;
  }
}

export interface NakayaCommitInput {
  temperatureC: number;
  supersaturation: number;
  isGuideOpen: boolean;
  lastHabit: string | null;
  announce: (message: string) => void;
}

export interface NakayaCommitResult {
  conditions: GrowthConditions;
  habitText: string;
}

/**
 * Commit Nakaya conditions through a single a11y channel:
 * #nakaya-status is the live region; announce() only when that region is hidden.
 */
export function commitNakayaConditions(input: NakayaCommitInput): NakayaCommitResult {
  // The share URL only keeps 0.1 °C and whole-percent SS. Grow that point so
  // Copy Link and Back replay the crystal on screen, not a finer one.
  const quantized = quantizeLabConditions({
    temperatureC: input.temperatureC,
    supersaturation: input.supersaturation,
  });
  const { isGuideOpen, lastHabit, announce } = input;
  const t = quantized.temperatureC;
  const ss = quantized.supersaturation;
  const habit = getHabit(t, ss);
  const habitText = habitLabel[habit];

  updateNakayaStatus(t, ss, false);

  // Field Guide's #nakaya-status is the live region for committed conditions.
  // Lab sliders still announce habit changes when that region is hidden.
  if (!isGuideOpen && lastHabit && lastHabit !== habitText) {
    announce(`Habit changed to: ${habitText}`);
  }

  return {
    habitText,
    conditions: {
      temperatureC: t,
      supersaturation: ss,
      habit,
      path: [{ temp: t, ss }],
    },
  };
}
