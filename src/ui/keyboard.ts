import { visualPress } from "./feedback";

export interface KeyboardHandlerContext {
  isAboutOpen: () => boolean;
  isGuideOpen: () => boolean;
  isLabMode: () => boolean;
  isUIHidden: () => boolean;
  isDiagramFocused: () => boolean;
  onEscapeAbout: () => void;
  onEscapeGuide: () => void;
  onEscapeLab: () => void;
  onEscapeUIHidden: () => void;
  onRotateView: (dx: number, dy: number) => void;
  onRefresh: () => void;
  onResetView: () => void;
  onToggleGuide: () => void;
  onNavigateShortcuts: () => void;
  onToggleLab: () => void;
  onToggleUI: () => void;
  onTogglePink: () => void;
  onTogglePrism: () => void;
  onToggleGlow: () => void;
  onSave: () => void;
  onSaveSvg: () => void;
  onSave3d: () => void;
  onSaveWallpaper: () => void;
  onToggleAutoRotate: () => void;
  onCopyLink: () => void;
  onCopySeed: () => void;
  onDailyCrystal: () => void;
}

/**
 * Keys that keep acting while held (continuous camera orbit). Every other
 * shortcut is a discrete action: one press is one action, so the OS
 * auto-repeat events a held key sends (`KeyboardEvent.repeat`) are ignored.
 */
export const REPEATABLE_KEYS: ReadonlySet<string> = new Set([
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
]);

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  );
}

function isInLabPane(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && Boolean(target.closest("#pane-mount"))
  );
}

function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('button, a, [role="button"], [role="link"]'));
}

export function initKeyboardShortcuts(ctx: KeyboardHandlerContext): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();

    // Global escape should always work to close overlays
    if (k === "escape") {
      if (ctx.isAboutOpen()) {
        ctx.onEscapeAbout();
        visualPress("about-close");
        return;
      } else if (ctx.isGuideOpen()) {
        ctx.onEscapeGuide();
        visualPress("guide-close");
        return;
      } else if (ctx.isLabMode()) {
        ctx.onEscapeLab();
        return;
      } else if (ctx.isUIHidden()) {
        ctx.onEscapeUIHidden();
        return;
      }
    }

    // Never hijack if user is typing or using system modifiers
    if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

    // Space should activate focused interactive elements (buttons/links) instead of refreshing
    if (k === " " && isInteractive(e.target)) return;

    // Don't hijack arrows if we're in the guide (allow scrolling) unless focused on diagram
    const isDiagramFocused = ctx.isDiagramFocused();
    const isGuideOpen = ctx.isGuideOpen();
    if (isGuideOpen && !isDiagramFocused && k.startsWith("arrow")) return;

    // A focused Lab slider owns its arrows (or a widget already consumed the
    // key), so the camera must not orbit at the same time.
    if (k.startsWith("arrow") && (e.defaultPrevented || isInLabPane(e.target)))
      return;

    // Space should scroll down the guide instead of refreshing if guide is open and active
    if (k === " " && isGuideOpen && !isDiagramFocused) return;

    // A held key must not re-fire a discrete action (a held R would regrow ~30
    // times a second, pushing a history entry each time). Space still has its
    // default suppressed so the held key doesn't scroll the page either.
    if (e.repeat && !REPEATABLE_KEYS.has(k)) {
      if (k === " ") e.preventDefault();
      return;
    }

    const delta = e.shiftKey ? 0.3 : 0.1;

    switch (k) {
      case "arrowup":
        e.preventDefault();
        ctx.onRotateView(0, -delta);
        break;
      case "arrowdown":
        e.preventDefault();
        ctx.onRotateView(0, delta);
        break;
      case "arrowleft":
        e.preventDefault();
        ctx.onRotateView(-delta, 0);
        break;
      case "arrowright":
        e.preventDefault();
        ctx.onRotateView(delta, 0);
        break;
      case "r":
        ctx.onRefresh();
        break;
      case " ":
        e.preventDefault();
        ctx.onRefresh();
        break;
      case "v":
        ctx.onResetView();
        break;
      case "g":
        ctx.onToggleGuide();
        break;
      case "?":
        ctx.onNavigateShortcuts();
        if (ctx.isGuideOpen()) {
          visualPress("guide-toggle");
        }
        break;
      case "l":
        ctx.onToggleLab();
        break;
      case "h":
        ctx.onToggleUI();
        break;
      case "p":
        ctx.onTogglePink();
        break;
      case "m":
        ctx.onTogglePrism();
        break;
      case "o":
        ctx.onToggleGlow();
        break;
      case "s":
        ctx.onSave();
        break;
      case "e":
        ctx.onSaveSvg();
        break;
      case "t":
        ctx.onSave3d();
        break;
      case "w":
        ctx.onSaveWallpaper();
        break;
      case "a":
        ctx.onToggleAutoRotate();
        break;
      case "c":
        ctx.onCopyLink();
        break;
      case "k":
        ctx.onCopySeed();
        break;
      case "d":
        ctx.onDailyCrystal();
        break;
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}
