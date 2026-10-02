/** @vitest-environment happy-dom */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HABIT_CHIP_ORDER,
  HABIT_PRESETS,
  HABIT_SHORT_LABEL,
  getHabit,
  habitLabel,
  type Habit,
} from "../../src/snowflake/nakaya";
import { initHabitChips, syncHabitChips } from "../../src/ui/habit-presets";

const ALL_HABITS = Object.keys(habitLabel) as Habit[];

describe("HABIT_PRESETS", () => {
  it("has a preset, a short label and a chip slot for every Habit", () => {
    expect([...ALL_HABITS].sort()).toEqual(Object.keys(HABIT_PRESETS).sort());
    expect([...ALL_HABITS].sort()).toEqual(Object.keys(HABIT_SHORT_LABEL).sort());
    expect([...ALL_HABITS].sort()).toEqual([...HABIT_CHIP_ORDER].sort());
  });

  it.each(ALL_HABITS)("%s: getHabit(preset.temp, preset.ss) returns that habit", (habit) => {
    const { temp, ss } = HABIT_PRESETS[habit];
    expect(getHabit(temp, ss)).toBe(habit);
  });

  it.each(ALL_HABITS)("%s: sits on the slider steps (0.5 °C / 1 %) in range, with ss stored 0–1", (habit) => {
    const { temp, ss } = HABIT_PRESETS[habit];
    expect(temp).toBeGreaterThanOrEqual(-40);
    expect(temp).toBeLessThanOrEqual(0);
    expect(Number.isInteger(temp * 2)).toBe(true);
    expect(ss).toBeGreaterThan(0);
    expect(ss).toBeLessThanOrEqual(1);
    expect(Number.isInteger(Math.round(ss * 100 * 1e6) / 1e6)).toBe(true);
  });
});

describe("index.html chip markup", () => {
  const html = readFileSync("index.html", "utf8");
  const group = html.match(/<div class="habit-chips"[^>]*>([\s\S]*?)<\/div>/);

  it("is a labelled group inside the Lab Mode controls", () => {
    expect(group).not.toBeNull();
    expect(html).toMatch(/id="habit-chips"[^>]*role="group"[^>]*aria-label="Jump to crystal habit"/);
    expect(html.indexOf('id="lab-controls"')).toBeLessThan(html.indexOf('id="habit-chips"'));
    expect(html.indexOf('id="pane-mount"')).toBeLessThan(html.indexOf('id="habit-chips"'));
  });

  it("has one native button chip per habit with the short label and full-name aria-label", () => {
    const chips = [...group![1].matchAll(/<button type="button" class="habit-chip" data-habit="(\w+)" aria-pressed="false" aria-label="([^"]+)" title="([^"]+)">([^<]+)<\/button>/g)];
    expect(chips.map((m) => m[1])).toEqual([...HABIT_CHIP_ORDER]);
    for (const [, habit, ariaLabel, title, text] of chips) {
      expect(ariaLabel).toBe(habitLabel[habit as Habit]);
      expect(title).toBe(habitLabel[habit as Habit]);
      expect(text).toBe(HABIT_SHORT_LABEL[habit as Habit]);
      // The visible text stays inside the accessible name (WCAG label-in-name).
      expect(ariaLabel.toLowerCase()).toContain(text.toLowerCase());
    }
  });
});

describe("chip helpers", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="chips">${ALL_HABITS.map(
      (h) => `<button type="button" class="habit-chip" data-habit="${h}" aria-pressed="false">${h}</button>`,
    ).join("")}</div><button id="other" data-habit="needle">x</button>`;
  });

  it("syncHabitChips presses only the current habit's chip", () => {
    syncHabitChips(document, "needle");
    const pressed = [...document.querySelectorAll(".habit-chip")].filter(
      (c) => c.getAttribute("aria-pressed") === "true",
    );
    expect(pressed.map((c) => (c as HTMLElement).dataset.habit)).toEqual(["needle"]);

    syncHabitChips(document, "plate");
    expect(document.querySelector('[data-habit="needle"]')!.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector('[data-habit="plate"]')!.getAttribute("aria-pressed")).toBe("true");
  });

  it("initHabitChips reports the tapped chip's habit and preset, and ignores other clicks", () => {
    const root = document.getElementById("chips")!;
    const onSelect = vi.fn();
    const dispose = initHabitChips(root, onSelect);

    (document.querySelector('[data-habit="needle"]') as HTMLElement).click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("needle", HABIT_PRESETS.needle);

    root.click();
    (document.getElementById("other") as HTMLElement).click();
    expect(onSelect).toHaveBeenCalledTimes(1);

    dispose();
    (document.querySelector('[data-habit="plate"]') as HTMLElement).click();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
