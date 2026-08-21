import { visualPress } from "./feedback";

export interface KeyboardHandlerContext {
  isGuideOpen: () => boolean;
  isLabMode: () => boolean;
  isUIHidden: () => boolean;
  isDiagramFocused: () => boolean;
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
  onSave: () => void;
  onToggleAutoRotate: () => void;
  onCopyLink: () => void;
  onCopySeed: () => void;
}

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  );
}

export function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('button, a, [role="button"], [role="link"]'));
}

export function initKeyboardShortcuts(ctx: KeyboardHandlerContext): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();

    // Global escape should always work to close overlays
    if (k === "escape") {
      if (ctx.isGuideOpen()) {
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

    // Space should scroll down the guide instead of refreshing if guide is open and active
    if (k === " " && isGuideOpen && !isDiagramFocused) return;

    const delta = e.shiftKey ? 0.3 : 0.1;

    // Performance Optimization: Static switch statement eliminates object allocation
    // and garbage collection overhead during high-frequency user keyboard input.
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
        visualPress("refresh");
        break;
      case " ":
        e.preventDefault();
        ctx.onRefresh();
        visualPress("refresh");
        break;
      case "v":
        ctx.onResetView();
        visualPress("btn-reset");
        break;
      case "g":
        ctx.onToggleGuide();
        visualPress("guide-toggle");
        break;
      case "?":
        ctx.onNavigateShortcuts();
        visualPress("guide-toggle");
        break;
      case "l":
        ctx.onToggleLab();
        visualPress("lab-toggle");
        break;
      case "h":
        ctx.onToggleUI();
        visualPress("btn-ui");
        break;
      case "p":
        ctx.onTogglePink();
        visualPress("btn-pink");
        break;
      case "m":
        ctx.onTogglePrism();
        visualPress("btn-prism");
        break;
      case "s":
        ctx.onSave();
        visualPress("btn-save");
        break;
      case "a":
        ctx.onToggleAutoRotate();
        visualPress("btn-rotate");
        break;
      case "c":
        ctx.onCopyLink();
        visualPress("btn-copy");
        visualPress("btn-seed");
        break;
      case "k":
        ctx.onCopySeed();
        visualPress("btn-copy-seed");
        break;
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}
