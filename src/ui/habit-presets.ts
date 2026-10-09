import { HABIT_PRESETS, type Habit } from "../snowflake/nakaya";

/**
 * Lab Mode habit chips: one tap jumps to a representative point inside
 * a habit's region. Markup lives in index.html (`.habit-chip[data-habit]`).
 */

const CHIP_SELECTOR = ".habit-chip[data-habit]";

function isHabit(value: string | undefined): value is Habit {
  return value !== undefined && Object.prototype.hasOwnProperty.call(HABIT_PRESETS, value);
}

/**
 * Mark the chip for `habit` pressed and the rest not. The caller invokes this
 * from the one place that writes `#stat-habit`, so the chips follow sliders,
 * the diagram, the keyboard, new seeds and Back/forward without extra hooks.
 */
export function syncHabitChips(root: ParentNode, habit: Habit): void {
  for (const chip of root.querySelectorAll<HTMLElement>(CHIP_SELECTOR)) {
    const pressed = chip.dataset.habit === habit ? "true" : "false";
    if (chip.getAttribute("aria-pressed") !== pressed) {
      chip.setAttribute("aria-pressed", pressed);
    }
  }
}

/** Delegated click handling: `onSelect` gets the habit and its preset (ss in 0–1). */
export function initHabitChips(
  root: HTMLElement,
  onSelect: (habit: Habit, preset: { temp: number; ss: number }) => void,
): () => void {
  const handler = (event: Event) => {
    const chip = (event.target as Element | null)?.closest<HTMLElement>(CHIP_SELECTOR);
    const habit = chip?.dataset.habit;
    if (!chip || !root.contains(chip) || !isHabit(habit)) return;
    onSelect(habit, HABIT_PRESETS[habit]);
  };
  root.addEventListener("click", handler);
  return () => root.removeEventListener("click", handler);
}
