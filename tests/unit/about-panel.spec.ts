/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAboutPanel, type AboutPanelController } from "../../src/ui/about-panel";

describe("initAboutPanel", () => {
  let trigger: HTMLButtonElement;
  let panel: HTMLElement;
  let closeButton: HTMLElement;
  let about: AboutPanelController;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    document.body.innerHTML = `
      <button id="btn-about" aria-expanded="false">About</button>
      <div id="about-panel" hidden tabindex="-1">
        <button id="about-close">Close</button>
      </div>
      <button id="outside">Outside</button>`;
    trigger = document.getElementById("btn-about") as HTMLButtonElement;
    panel = document.getElementById("about-panel")!;
    closeButton = document.getElementById("about-close")!;
    about = initAboutPanel({
      trigger,
      panel,
      closeButton,
      reducedMotion: () => false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens from the trigger and focuses the panel", () => {
    trigger.click();
    expect(about.isOpen()).toBe(true);
    expect(panel.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(panel);
  });

  it("closes via Close control and restores trigger focus", () => {
    about.open();
    closeButton.click();
    expect(about.isOpen()).toBe(false);
    expect(panel.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when pointerdown happens outside the panel", () => {
    about.open();
    document.getElementById("outside")!.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    expect(about.isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("skips entrance animation when reduced motion is preferred", () => {
    const reduced = initAboutPanel({
      trigger,
      panel,
      closeButton,
      reducedMotion: () => true,
    });
    reduced.open();
    expect(panel.classList.contains("about-panel--entered")).toBe(false);
  });
});
