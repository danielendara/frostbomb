/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPhotoMode, type PhotoModeController } from "../../src/ui/photo-mode";

describe("createPhotoMode", () => {
  const announce = vi.fn();
  const scene = { setPhotoMode: vi.fn() };
  let canvas: HTMLElement;
  let btn: HTMLElement;
  let inUI: HTMLElement;
  let masthead: HTMLElement;
  let pm: PhotoModeController;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.innerHTML = `
      <header class="masthead"><button id="in-ui">In UI</button></header>
      <footer class="footer"></footer>
      <canvas id="c"></canvas>
      <button id="btn-ui">UI</button>
      <button id="elsewhere">Elsewhere</button>`;
    canvas = document.getElementById("c")!;
    btn = document.getElementById("btn-ui")!;
    inUI = document.getElementById("in-ui")!;
    masthead = document.querySelector(".masthead")!;
    pm = createPhotoMode({ canvas, button: btn, scene, announce, reducedMotion: () => false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides UI roots, marks them inert, and moves focus to the canvas", () => {
    inUI.focus();
    pm.toggle();
    expect(pm.isHidden()).toBe(true);
    for (const el of document.querySelectorAll(".masthead, .footer")) {
      expect(el.hasAttribute("inert")).toBe(true);
      expect(el.classList.contains("ui-hidden")).toBe(true);
    }
    expect(document.activeElement).toBe(canvas);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(scene.setPhotoMode).toHaveBeenCalledWith(true);
  });

  it("announces differently under reduced motion", () => {
    const reduced = createPhotoMode({
      canvas,
      button: btn,
      scene,
      announce,
      reducedMotion: () => true,
    });
    reduced.toggle();
    expect(announce).toHaveBeenCalledWith("Photo Mode. Press H or Esc to show UI.");
  });

  it("restores focus to #btn-ui on exit and clears inert/hidden", () => {
    inUI.focus();
    pm.toggle();
    pm.toggle(true);
    expect(pm.isHidden()).toBe(false);
    expect(masthead.hasAttribute("inert")).toBe(false);
    expect(masthead.classList.contains("ui-hidden")).toBe(false);
    expect(canvas.hasAttribute("tabindex")).toBe(false);
    expect(document.activeElement).toBe(btn);
    expect(announce).toHaveBeenCalledWith("Photo Mode exited. UI restored.");
  });

  it("stops retrying once the user moves focus after exit", () => {
    pm.toggle();
    // Make the immediate focus attempt not stick so retries are scheduled.
    const focusSpy = vi.spyOn(btn, "focus").mockImplementation(() => {});
    pm.toggle(true);
    expect(focusSpy).toHaveBeenCalledTimes(1);
    const elsewhere = document.getElementById("elsewhere")!;
    elsewhere.focus();
    vi.advanceTimersByTime(2000);
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(elsewhere);
  });

  it("keeps retrying while focus is untouched", () => {
    pm.toggle();
    const focusSpy = vi.spyOn(btn, "focus").mockImplementation(() => {});
    pm.toggle(true);
    vi.advanceTimersByTime(800);
    expect(focusSpy.mock.calls.length).toBeGreaterThan(1);
  });

  it("re-entering Photo Mode cancels a pending restore", () => {
    pm.toggle();
    const focusSpy = vi.spyOn(btn, "focus").mockImplementation(() => {});
    pm.toggle(true);
    expect(focusSpy).toHaveBeenCalledTimes(1);
    pm.toggle();
    vi.advanceTimersByTime(2000);
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(pm.isHidden()).toBe(true);
  });

  it("pulls focus back to the canvas if it lands inside hidden UI", () => {
    pm.toggle();
    inUI.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(document.activeElement).toBe(canvas);
  });
});
