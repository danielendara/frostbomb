/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getHabit, habitLabel } from "../../src/snowflake/nakaya";
import { commitNakayaConditions } from "../../src/ui/nakaya-status";

function statusEl(): HTMLElement {
  return document.getElementById("nakaya-status") as HTMLElement;
}

describe("Nakaya commit single-channel announce", () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="nakaya-status" class="nakaya-label" aria-live="polite"></div>';
  });

  it("updates #nakaya-status and does not announce when the Field Guide is open", () => {
    const announce = vi.fn();
    const result = commitNakayaConditions({
      temperatureC: -15,
      supersaturation: 0.8,
      isGuideOpen: true,
      lastHabit: "Hexagonal plate",
      announce,
    });

    const status = statusEl();
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("Active:");
    expect(status.textContent).toContain("-15.0°C");
    expect(status.textContent).toContain("80%");
    expect(status.textContent).toContain(result.habitText);
    expect(result.habitText).toBe("Stellar dendrite");
    expect(announce).not.toHaveBeenCalled();
  });

  it("announces habit changes from lab sliders when the Field Guide is closed", () => {
    const announce = vi.fn();
    const result = commitNakayaConditions({
      temperatureC: -15,
      supersaturation: 0.8,
      isGuideOpen: false,
      lastHabit: "Hexagonal plate",
      announce,
    });

    expect(statusEl().textContent).toContain("Active:");
    expect(statusEl().textContent).toContain(result.habitText);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(`Habit changed to: ${result.habitText}`);
  });

  it("does not announce when lab conditions keep the same habit", () => {
    const announce = vi.fn();
    const habitText = habitLabel[getHabit(-15, 0.8)];
    commitNakayaConditions({
      temperatureC: -15,
      supersaturation: 0.8,
      isGuideOpen: false,
      lastHabit: habitText,
      announce,
    });

    expect(statusEl().textContent).toContain("Active:");
    expect(announce).not.toHaveBeenCalled();
  });
});
