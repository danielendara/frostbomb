import { visualPress } from "./feedback";

export interface AboutPanelController {
  isOpen: () => boolean;
  open: () => void;
  /** @param immediate Skip the exit fade (e.g. when chrome is hidden for Photo Mode). */
  close: (immediate?: boolean) => void;
  toggle: () => void;
}

export interface AboutPanelOptions {
  reducedMotion: () => boolean;
  /** Called when Photo Mode or other chrome hides; force-close without focus churn. */
  onForceClose?: () => void;
}

export function initAboutPanel(opts: AboutPanelOptions): AboutPanelController {
  const btn = document.getElementById("btn-about");
  const panel = document.getElementById("about-panel");
  const closeBtn = document.getElementById("about-close");
  let open = false;

  const setExpanded = (value: boolean): void => {
    if (btn) btn.setAttribute("aria-expanded", value.toString());
  };

  const focusPanel = (): void => {
    if (panel instanceof HTMLElement) {
      panel.focus({ preventScroll: true });
    }
  };

  const close = (immediate = false): void => {
    if (!open) return;
    open = false;
    setExpanded(false);
    if (panel) {
      panel.classList.remove("is-visible");
      const fadeMs = immediate || opts.reducedMotion() ? 0 : 300;
      if (fadeMs === 0) {
        panel.hidden = true;
      } else {
        window.setTimeout(() => {
          if (!open) panel.hidden = true;
        }, fadeMs);
      }
    }
    if (!immediate && btn instanceof HTMLElement) {
      requestAnimationFrame(() => btn.focus({ preventScroll: true }));
    }
  };

  const openPanel = (): void => {
    if (open || !panel) return;
    open = true;
    setExpanded(true);
    panel.hidden = false;
    panel.classList.remove("is-visible");
    void panel.offsetWidth;
    panel.classList.add("is-visible");
    requestAnimationFrame(focusPanel);
  };

  const toggle = (): void => {
    if (open) close();
    else openPanel();
  };

  btn?.addEventListener("click", () => {
    visualPress("btn-about");
    toggle();
  });

  closeBtn?.addEventListener("click", () => {
    visualPress("about-close");
    close();
  });

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!open) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (panel?.contains(target)) return;
      if (btn?.contains(target)) return;
      close();
    },
    true,
  );

  return {
    isOpen: () => open,
    open: openPanel,
    close,
    toggle,
  };
}
