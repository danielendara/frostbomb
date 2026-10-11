/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initKeyboardShortcuts,
  REPEATABLE_KEYS,
  type KeyboardHandlerContext,
} from "../../src/ui/keyboard";

interface Harness {
  ctx: KeyboardHandlerContext;
  handlers: Record<string, ReturnType<typeof vi.fn>>;
  state: { guideOpen: boolean; diagramFocused: boolean };
}

function makeCtx(): Harness {
  const state = { guideOpen: false, diagramFocused: false };
  const handlers: Record<string, ReturnType<typeof vi.fn>> = {};
  const track = <K extends keyof KeyboardHandlerContext>(
    name: K,
    mock: KeyboardHandlerContext[K],
  ) => {
    handlers[name as string] = mock as ReturnType<typeof vi.fn>;
    return mock;
  };
  const ctx: KeyboardHandlerContext = {
    isGuideOpen: () => state.guideOpen,
    isLabMode: () => false,
    isUIHidden: () => false,
    isDiagramFocused: () => state.diagramFocused,
    onEscapeGuide: track("onEscapeGuide", vi.fn()),
    onEscapeLab: track("onEscapeLab", vi.fn()),
    onEscapeUIHidden: track("onEscapeUIHidden", vi.fn()),
    onRotateView: track("onRotateView", vi.fn()),
    onRefresh: track("onRefresh", vi.fn()),
    onResetView: track("onResetView", vi.fn()),
    onToggleGuide: track("onToggleGuide", vi.fn()),
    onNavigateShortcuts: track("onNavigateShortcuts", vi.fn()),
    onToggleLab: track("onToggleLab", vi.fn()),
    onToggleUI: track("onToggleUI", vi.fn()),
    onTogglePink: track("onTogglePink", vi.fn()),
    onTogglePrism: track("onTogglePrism", vi.fn()),
    onSave: track("onSave", vi.fn()),
    onSaveSvg: track("onSaveSvg", vi.fn()),
    onSave3d: track("onSave3d", vi.fn()),
    onSaveWallpaper: track("onSaveWallpaper", vi.fn()),
    onToggleAutoRotate: track("onToggleAutoRotate", vi.fn()),
    onCopyLink: track("onCopyLink", vi.fn()),
    onCopySeed: track("onCopySeed", vi.fn()),
    onDailyCrystal: track("onDailyCrystal", vi.fn()),
  };
  return { ctx, handlers, state };
}

/** Dispatch a keydown the way the browser would: bubbling and cancelable. */
function keydown(
  key: string,
  init: KeyboardEventInit = {},
  target: EventTarget = window,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

// Every discrete (one press = one action) shortcut in the Field Guide list,
// and the ctx handler it fires. Space is a second key for regrow.
const DISCRETE_SHORTCUTS: ReadonlyArray<readonly [key: string, handler: string]> = [
  ["r", "onRefresh"],
  [" ", "onRefresh"],
  ["v", "onResetView"],
  ["g", "onToggleGuide"],
  ["?", "onNavigateShortcuts"],
  ["l", "onToggleLab"],
  ["h", "onToggleUI"],
  ["p", "onTogglePink"],
  ["m", "onTogglePrism"],
  ["s", "onSave"],
  ["e", "onSaveSvg"],
  ["t", "onSave3d"],
  ["w", "onSaveWallpaper"],
  ["a", "onToggleAutoRotate"],
  ["c", "onCopyLink"],
  ["k", "onCopySeed"],
  ["d", "onDailyCrystal"],
];

describe("initKeyboardShortcuts key auto-repeat", () => {
  let h: Harness;
  let dispose: () => void;

  beforeEach(() => {
    document.body.innerHTML = "";
    h = makeCtx();
    dispose = initKeyboardShortcuts(h.ctx);
  });

  afterEach(() => {
    dispose();
  });

  it("treats exactly the four arrow keys as repeatable", () => {
    expect([...REPEATABLE_KEYS].sort()).toEqual([
      "arrowdown",
      "arrowleft",
      "arrowright",
      "arrowup",
    ]);
  });

  describe.each(DISCRETE_SHORTCUTS)("%j", (key, handlerName) => {
    it(`fires ${handlerName} once on a fresh press`, () => {
      keydown(key, { repeat: false });
      expect(h.handlers[handlerName]).toHaveBeenCalledTimes(1);
    });

    it("ignores the OS auto-repeat events while the key is held", () => {
      keydown(key, { repeat: false });
      for (let i = 0; i < 30; i++) keydown(key, { repeat: true });

      // One action for the press, none for the 30 repeats, and no other
      // handler ran either.
      expect(h.handlers[handlerName]).toHaveBeenCalledTimes(1);
      const totalCalls = Object.values(h.handlers).reduce(
        (sum, mock) => sum + mock.mock.calls.length,
        0,
      );
      expect(totalCalls).toBe(1);
    });
  });

  it("D grows today's crystal once and does not fire while typing in an input", () => {
    keydown("d", { repeat: false });
    keydown("D", { repeat: true });
    expect(h.handlers.onDailyCrystal).toHaveBeenCalledTimes(1);

    const input = document.createElement("input");
    document.body.appendChild(input);
    keydown("d", { repeat: false }, input);
    keydown("D", { repeat: false }, input);
    expect(h.handlers.onDailyCrystal).toHaveBeenCalledTimes(1);
  });

  it("R with repeat:true does not call onRefresh; with repeat:false it does", () => {
    keydown("r", { repeat: true });
    expect(h.handlers.onRefresh).not.toHaveBeenCalled();

    keydown("r", { repeat: false });
    expect(h.handlers.onRefresh).toHaveBeenCalledTimes(1);
  });

  it("a held Space neither regrows nor scrolls the page", () => {
    const press = keydown(" ", { repeat: false });
    expect(press.defaultPrevented).toBe(true);
    expect(h.handlers.onRefresh).toHaveBeenCalledTimes(1);

    const repeat = keydown(" ", { repeat: true });
    expect(repeat.defaultPrevented).toBe(true);
    expect(h.handlers.onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not swallow the default action of repeating letter keys", () => {
    expect(keydown("r", { repeat: true }).defaultPrevented).toBe(false);
  });

  it.each([
    ["ArrowUp", 0, -0.1],
    ["ArrowDown", 0, 0.1],
    ["ArrowLeft", -0.1, 0],
    ["ArrowRight", 0.1, 0],
  ])("%s with repeat:true still rotates the view", (key, dx, dy) => {
    const event = keydown(key, { repeat: true });
    expect(h.handlers.onRotateView).toHaveBeenCalledTimes(1);
    expect(h.handlers.onRotateView).toHaveBeenCalledWith(dx, dy);
    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps Shift+Arrow fast rotation while repeating", () => {
    keydown("ArrowRight", { repeat: true, shiftKey: true });
    expect(h.handlers.onRotateView).toHaveBeenCalledWith(0.3, 0);
  });

  it("repeated modifier chords stay ignored", () => {
    keydown("r", { repeat: true, ctrlKey: true });
    keydown("r", { repeat: false, metaKey: true });
    expect(h.handlers.onRefresh).not.toHaveBeenCalled();
  });

  describe("where Space is left to the browser (unchanged)", () => {
    it("a held Space on a focused button is not intercepted", () => {
      const button = document.createElement("button");
      document.body.appendChild(button);

      const event = keydown(" ", { repeat: true }, button);
      expect(event.defaultPrevented).toBe(false);
      expect(h.handlers.onRefresh).not.toHaveBeenCalled();
    });

    it("a held Space scrolls an open Field Guide instead of being prevented", () => {
      h.state.guideOpen = true;

      const event = keydown(" ", { repeat: true });
      expect(event.defaultPrevented).toBe(false);
      expect(h.handlers.onRefresh).not.toHaveBeenCalled();
    });
  });
});

describe("initKeyboardShortcuts arrows vs. Lab pane widgets", () => {
  let h: Harness;
  let dispose: () => void;

  beforeEach(() => {
    document.body.innerHTML =
      '<div id="pane-mount"><div tabindex="0" class="slider"></div></div><div id="other"></div>';
    h = makeCtx();
    dispose = initKeyboardShortcuts(h.ctx);
  });

  afterEach(() => {
    dispose();
  });

  it("does not orbit on arrows dispatched inside #pane-mount", () => {
    const slider = document.querySelector(".slider")!;
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      keydown(key, {}, slider);
    }
    expect(h.handlers.onRotateView).not.toHaveBeenCalled();
  });

  it("still fires letter shortcuts inside #pane-mount", () => {
    keydown("r", {}, document.querySelector(".slider")!);
    expect(h.handlers.onRefresh).toHaveBeenCalledTimes(1);
  });

  it("ignores an arrow already defaultPrevented outside the pane", () => {
    const other = document.getElementById("other")!;
    other.addEventListener("keydown", (e) => e.preventDefault());
    keydown("ArrowLeft", {}, other);
    expect(h.handlers.onRotateView).not.toHaveBeenCalled();
  });

  it("still orbits on arrows from the window/body, Shift is fast", () => {
    keydown("ArrowLeft");
    expect(h.handlers.onRotateView).toHaveBeenLastCalledWith(-0.1, 0);
    keydown("ArrowRight", { shiftKey: true }, document.body);
    expect(h.handlers.onRotateView).toHaveBeenLastCalledWith(0.3, 0);
  });
});
