/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { announce } from "../../src/ui/announcer";
import { isExportBusy, runExportAction } from "../../src/ui/export-action";

vi.mock("../../src/ui/announcer", () => ({
  announce: vi.fn(),
}));

const MESSAGES = {
  start: "Saving snowflake as SVG",
  success: "Snowflake SVG saved",
  failure: "Failed to save snowflake SVG",
};

describe("runExportAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    document.body.innerHTML = `
      <button id="btn-save-svg" aria-label="Save as SVG (E)">
        <span class="action-btn__icon">⬡</span>
        <span class="action-btn__label">Save SVG</span>
      </button>
      <div id="a11y-announcer"></div>
    `;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets busy/disabled state and announces start then success", async () => {
    let sawBusy = false;
    const work = vi.fn(async () => {
      const btn = document.getElementById("btn-save-svg") as HTMLButtonElement;
      sawBusy = btn.disabled && btn.getAttribute("aria-busy") === "true";
      expect(isExportBusy("btn-save-svg")).toBe(true);
    });

    const done = runExportAction("btn-save-svg", MESSAGES, work);
    expect(announce).toHaveBeenCalledWith("Saving snowflake as SVG");

    await done;

    expect(sawBusy).toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("Snowflake SVG saved");
    expect(isExportBusy("btn-save-svg")).toBe(false);
    const btn = document.getElementById("btn-save-svg") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute("aria-busy")).toBeNull();
  });

  it("announces failure and does not download when work throws", async () => {
    const download = vi.fn();
    const result = await runExportAction("btn-save-svg", MESSAGES, () => {
      throw new Error("export failed");
    });

    expect(result).toBe(false);
    expect(download).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith("Failed to save snowflake SVG");
    expect(document.getElementById("btn-save-svg")?.classList.contains("btn--error")).toBe(
      true,
    );
  });

  it("ignores a second start so a hung export cannot double-download", async () => {
    const download = vi.fn();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = runExportAction("btn-save-svg", MESSAGES, async () => {
      await gate;
      download();
    });
    const second = await runExportAction("btn-save-svg", MESSAGES, download);

    expect(second).toBe(false);
    expect(isExportBusy("btn-save-svg")).toBe(true);
    release();
    expect(await first).toBe(true);
    expect(download).toHaveBeenCalledTimes(1);
  });
});
