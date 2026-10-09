/** @vitest-environment happy-dom */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HABIT_PRESETS,
  getHabit,
  habitLabel,
  type Habit,
} from "../../src/snowflake/nakaya";
import { initHabitChips, syncHabitChips } from "../../src/ui/habit-presets";

const ALL_HABITS = Object.keys(habitLabel) as Habit[];

const INDEX_HTML = readFileSync("index.html", "utf8");
const HABIT_CHIPS_GROUP = INDEX_HTML.match(/<div class="habit-chips"[^>]*>([\s\S]*?)<\/div>/);
const HABIT_CHIP_RE =
  /<button type="button" class="habit-chip" data-habit="(\w+)" aria-pressed="false" aria-label="([^"]+)" title="([^"]+)">([^<]+)<\/button>/g;

function habitChipsFromIndexHtml(): { habit: Habit; ariaLabel: string; title: string; text: string }[] {
  expect(HABIT_CHIPS_GROUP).not.toBeNull();
  return [...HABIT_CHIPS_GROUP![1].matchAll(HABIT_CHIP_RE)].map((m) => ({
    habit: m[1] as Habit,
    ariaLabel: m[2],
    title: m[3],
    text: m[4],
  }));
}

describe("HABIT_PRESETS", () => {
  it("has a preset and an index.html chip for every Habit", () => {
    const chips = habitChipsFromIndexHtml();
    expect([...ALL_HABITS].sort()).toEqual(Object.keys(HABIT_PRESETS).sort());
    expect([...ALL_HABITS].sort()).toEqual([...chips.map((c) => c.habit)].sort());
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
  it("is a labelled group inside the Lab Mode controls", () => {
    expect(HABIT_CHIPS_GROUP).not.toBeNull();
    expect(INDEX_HTML).toMatch(/id="habit-chips"[^>]*role="group"[^>]*aria-label="Jump to crystal habit"/);
    expect(INDEX_HTML.indexOf('id="lab-controls"')).toBeLessThan(INDEX_HTML.indexOf('id="habit-chips"'));
    expect(INDEX_HTML.indexOf('id="pane-mount"')).toBeLessThan(INDEX_HTML.indexOf('id="habit-chips"'));
  });

  it("has one native button chip per habit with the short label and full-name aria-label", () => {
    const chips = habitChipsFromIndexHtml();
    for (const { habit, ariaLabel, title, text } of chips) {
      expect(ariaLabel).toBe(habitLabel[habit]);
      expect(title).toBe(habitLabel[habit]);
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
