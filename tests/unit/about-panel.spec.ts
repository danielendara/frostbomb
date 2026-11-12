/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAboutPanel } from "../../src/ui/about-panel";
import { initKeyboardShortcuts } from "../../src/ui/keyboard";

function stubDialogPolyfill() {
  if (typeof HTMLDialogElement !== "undefined" && "showModal" in HTMLDialogElement.prototype) {
    return;
  }
  (HTMLDialogElement.prototype as HTMLDialogElement & { open: boolean }).showModal = function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

describe("createAboutPanel", () => {
  beforeEach(() => {
    stubDialogPolyfill();
    document.body.innerHTML = `
      <button type="button" id="btn-about" aria-expanded="false">About</button>
      <dialog id="about-panel" tabindex="-1" aria-labelledby="about-panel-title">
        <h2 id="about-panel-title">About</h2>
        <button type="button" id="about-close">Close</button>
      </dialog>`;
  });

  it("opens from the About button, focuses the panel, and closes restoring focus", () => {
    const panel = createAboutPanel(() => true);
    const aboutBtn = document.getElementById("btn-about") as HTMLButtonElement;

    aboutBtn.click();
    expect(panel.isOpen()).toBe(true);
    expect(aboutBtn.getAttribute("aria-expanded")).toBe("true");

    (document.getElementById("about-close") as HTMLButtonElement).click();
    expect(panel.isOpen()).toBe(false);
    expect(aboutBtn.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(aboutBtn);
  });

  it("routes Escape through keyboard shortcuts before other overlays", () => {
    const panel = createAboutPanel(() => true);
    const aboutBtn = document.getElementById("btn-about") as HTMLButtonElement;

    aboutBtn.click();
    expect(panel.isOpen()).toBe(true);

    const onEscapeGuide = vi.fn();
    const dispose = initKeyboardShortcuts({
      isAboutOpen: () => panel.isOpen(),
      isGuideOpen: () => true,
      isLabMode: () => false,
      isUIHidden: () => false,
      isDiagramFocused: () => false,
      onEscapeAbout: () => panel.close(),
      onEscapeGuide,
      onEscapeLab: vi.fn(),
      onEscapeUIHidden: vi.fn(),
      onRotateView: vi.fn(),
      onRefresh: vi.fn(),
      onResetView: vi.fn(),
      onToggleGuide: vi.fn(),
      onNavigateShortcuts: vi.fn(),
      onToggleLab: vi.fn(),
      onToggleUI: vi.fn(),
      onTogglePink: vi.fn(),
      onTogglePrism: vi.fn(),
      onToggleGlow: vi.fn(),
      onSave: vi.fn(),
      onSaveSvg: vi.fn(),
      onSave3d: vi.fn(),
      onSaveWallpaper: vi.fn(),
      onToggleAutoRotate: vi.fn(),
      onCopyLink: vi.fn(),
      onCopySeed: vi.fn(),
      onDailyCrystal: vi.fn(),
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel.isOpen()).toBe(false);
    expect(onEscapeGuide).not.toHaveBeenCalled();
    dispose();
  });
});
