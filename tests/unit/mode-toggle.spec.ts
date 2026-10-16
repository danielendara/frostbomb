/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it } from "vitest";
import { MODE_TOGGLES, syncModeToggleButton, type ShareModeKind } from "../../src/ui/mode-toggle";

function makeButton(id: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.id = id;
  document.body.appendChild(btn);
  return btn;
}

describe("MODE_TOGGLES", () => {
  it("maps each mode to its button, shortcut key, body class and share param", () => {
    expect(MODE_TOGGLES.pink).toEqual({
      buttonId: "btn-pink",
      label: "Pink",
      key: "P",
      bodyClass: "pink-mode",
      param: "pink",
    });
    expect(MODE_TOGGLES.prism).toEqual({
      buttonId: "btn-prism",
      label: "Prism",
      key: "M",
      bodyClass: "prism-mode",
      param: "prism",
    });
  });
});

describe("syncModeToggleButton", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const expected: Record<ShareModeKind, { label: string; title: (state: string) => string }> = {
    pink: { label: "Pink Mode (P)", title: (state) => `Toggle pink mode (P) - current: ${state}` },
    prism: { label: "Prism Mode (M)", title: (state) => `Toggle prism mode (M) - current: ${state}` },
  };

  for (const kind of ["pink", "prism"] as const) {
    it(`${kind}: sets pressed state, active class, aria-label and title when on`, () => {
      const btn = makeButton(MODE_TOGGLES[kind].buttonId);
      syncModeToggleButton(btn, MODE_TOGGLES[kind], true);

      expect(btn.getAttribute("aria-pressed")).toBe("true");
      expect(btn.classList.contains("active")).toBe(true);
      expect(btn.getAttribute("aria-label")).toBe(expected[kind].label);
      expect(btn.title).toBe(expected[kind].title("active"));
    });

    it(`${kind}: clears pressed state and active class when off`, () => {
      const btn = makeButton(MODE_TOGGLES[kind].buttonId);
      syncModeToggleButton(btn, MODE_TOGGLES[kind], true);
      syncModeToggleButton(btn, MODE_TOGGLES[kind], false);

      expect(btn.getAttribute("aria-pressed")).toBe("false");
      expect(btn.classList.contains("active")).toBe(false);
      expect(btn.getAttribute("aria-label")).toBe(expected[kind].label);
      expect(btn.title).toBe(expected[kind].title("inactive"));
    });
  }

  it("leaves other classes on the button alone", () => {
    const btn = makeButton("btn-pink");
    btn.classList.add("icon-btn");
    syncModeToggleButton(btn, MODE_TOGGLES.pink, true);
    syncModeToggleButton(btn, MODE_TOGGLES.pink, false);
    expect(btn.classList.contains("icon-btn")).toBe(true);
  });

  it("does nothing when the button is missing", () => {
    expect(() => syncModeToggleButton(null, MODE_TOGGLES.pink, true)).not.toThrow();
  });
});
