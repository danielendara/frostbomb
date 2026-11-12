import { visualPress } from "./feedback";

const PHOTO_MODE_UI_SELECTOR =
  ".masthead, .field-notes, .footer, .lab-controls, #about-panel";

export interface PhotoModeOptions {
  canvas: HTMLElement;
  button: HTMLElement | null;
  scene: { setPhotoMode(enabled: boolean): void };
  announce: (message: string) => void;
  reducedMotion: () => boolean;
}

export interface PhotoModeController {
  /** Toggle Photo Mode, or force it off (`true`) / on (`false`) via `forceShow`. */
  toggle(forceShow?: boolean): void;
  isHidden(): boolean;
}

export function createPhotoMode(opts: PhotoModeOptions): PhotoModeController {
  const { canvas, button: btnUI, scene, announce, reducedMotion } = opts;
  let isUIHidden = false;

  const getUIElements = (): NodeListOf<Element> =>
    document.querySelectorAll(PHOTO_MODE_UI_SELECTOR);

  const isFocusInUI = (el: Element | null): boolean => {
    if (!(el instanceof HTMLElement)) return false;
    return Array.from(getUIElements()).some((root) => root.contains(el));
  };

  const setUIInert = (inert: boolean): void => {
    getUIElements().forEach((el) => {
      if (inert) {
        el.setAttribute("inert", "");
      } else {
        el.removeAttribute("inert");
      }
    });
  };

  const focusScene = (): void => {
    if (!canvas.hasAttribute("tabindex")) {
      canvas.setAttribute("tabindex", "-1");
    }
    canvas.focus({ preventScroll: true });
  };

  /** Bumped on every Photo Mode toggle so a stale focus restore stops. */
  let focusGeneration = 0;

  /**
   * Focus #btn-ui after Photo Mode exits. `exitFocus` is what had focus at
   * exit; it, the scene canvas, and body count as "not moved by the user"
   * (some browsers keep the canvas focused after its tabindex goes). Anything
   * else means the user moved focus, so every attempt stands down, as they
   * all do if Photo Mode re-enters.
   */
  const restoreUIFocus = (exitFocus: Element | null): void => {
    const generation = ++focusGeneration;
    let frameAttempts = 0;
    const maxFrameAttempts = 60;
    /** true = keep trying, false = done or must stop. */
    const focusBtn = (): boolean => {
      if (!(btnUI instanceof HTMLElement)) return false;
      if (generation !== focusGeneration || isUIHidden) return false;
      const active = document.activeElement;
      if (active === btnUI) return false;
      const untouched =
        !active || active === document.body || active === exitFocus || active === canvas;
      if (!untouched) return false;
      btnUI.focus({ preventScroll: true });
      return document.activeElement !== btnUI;
    };

    // Visibility switches instantly on show (style.css), so this usually lands
    // at once; the retries cover slow frames and stale focus state.
    if (!focusBtn()) return;
    requestAnimationFrame(() => requestAnimationFrame(focusBtn));
    setTimeout(focusBtn, 350);
    setTimeout(focusBtn, 700);

    // Slow frames can stall the timeline, so keep retrying for a short while.
    const deadline = performance.now() + 1500;
    const retry = () => {
      frameAttempts++;
      const needsRetry = focusBtn();
      if (!needsRetry) return;
      if (frameAttempts >= maxFrameAttempts || performance.now() > deadline) return;
      requestAnimationFrame(retry);
    };
    requestAnimationFrame(retry);
  };

  document.addEventListener("focusin", (e) => {
    if (!isUIHidden) return;
    const target = e.target;
    if (target instanceof HTMLElement && target.closest(".ui-hidden")) {
      focusScene();
    }
  });

  function toggle(forceShow?: boolean): void {
    isUIHidden = forceShow === undefined ? !isUIHidden : !forceShow;
    visualPress("btn-ui");

    getUIElements().forEach((el) => el.classList.toggle("ui-hidden", isUIHidden));
    setUIInert(isUIHidden);

    if (btnUI) {
      btnUI.setAttribute("aria-pressed", isUIHidden.toString());
      btnUI.classList.toggle("active", isUIHidden);
    }

    scene.setPhotoMode(isUIHidden);

    if (isUIHidden) {
      focusGeneration++;
      announce(
        reducedMotion()
          ? "Photo Mode. Press H or Esc to show UI."
          : "Photo Mode. Depth of field on. Press H or Esc to show UI.",
      );
      if (isFocusInUI(document.activeElement)) {
        focusScene();
      }
    } else {
      const exitFocus = document.activeElement;
      canvas.removeAttribute("tabindex");
      announce("Photo Mode exited. UI restored.");
      restoreUIFocus(exitFocus);
    }
  }

  return { toggle, isHidden: () => isUIHidden };
}
