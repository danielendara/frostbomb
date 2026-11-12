/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAboutPanel } from "../../src/ui/about-panel";

describe("initAboutPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <button id="btn-about" aria-expanded="false" aria-controls="about-panel">About</button>
      <div id="about-panel" hidden role="dialog" tabindex="-1">
        <button id="about-close">Close</button>
      </div>
      <main id="outside">Outside</main>`;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens, focuses the panel, and closes with focus restored to About", async () => {
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
    const panel = initAboutPanel({ reducedMotion: () => true });
    const btn = document.getElementById("btn-about") as HTMLButtonElement;
    const dialog = document.getElementById("about-panel") as HTMLElement;

    btn.click();
    expect(panel.isOpen()).toBe(true);
    expect(dialog.hidden).toBe(false);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(dialog);

    panel.close();
    vi.runAllTimers();
    expect(panel.isOpen()).toBe(false);
    expect(dialog.hidden).toBe(true);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(btn);
    raf.mockRestore();
  });

  it("closes on outside pointerdown", () => {
    const panel = initAboutPanel({ reducedMotion: () => true });
    panel.open();
    document.getElementById("outside")!.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    vi.runAllTimers();
    expect(panel.isOpen()).toBe(false);
  });

  it("Close button dismisses the panel", () => {
    const panel = initAboutPanel({ reducedMotion: () => true });
    panel.open();
    document.getElementById("about-close")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    vi.runAllTimers();
    expect(panel.isOpen()).toBe(false);
  });
});
