import { visualPress } from "./feedback";

export interface AboutPanelOptions {
  panel: HTMLElement;
  trigger: HTMLButtonElement;
  closeButton: HTMLElement;
  reducedMotion: () => boolean;
}

export interface AboutPanelController {
  isOpen: () => boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export function initAboutPanel(opts: AboutPanelOptions): AboutPanelController {
  const { panel, trigger, closeButton, reducedMotion } = opts;
  let open = false;

  const setExpanded = (value: boolean) => {
    trigger.setAttribute("aria-expanded", String(value));
  };

  const focusPanel = () => {
    requestAnimationFrame(() => {
      if (!open) return;
      panel.focus({ preventScroll: true });
    });
  };

  const openPanel = () => {
    if (open) return;
    open = true;
    panel.hidden = false;
    panel.classList.remove("about-panel--closing");
    if (!reducedMotion()) {
      panel.classList.remove("about-panel--entered");
      void panel.offsetWidth;
      panel.classList.add("about-panel--entered");
    }
    setExpanded(true);
    focusPanel();
  };

  const closePanel = () => {
    if (!open) return;
    open = false;
    panel.hidden = true;
    panel.classList.remove("about-panel--entered", "about-panel--closing");
    setExpanded(false);
    requestAnimationFrame(() => {
      trigger.focus({ preventScroll: true });
    });
  };

  const toggle = () => {
    if (open) closePanel();
    else openPanel();
  };

  trigger.addEventListener("click", () => {
    visualPress("btn-about");
    toggle();
  });

  closeButton.addEventListener("click", () => {
    visualPress("about-close");
    closePanel();
  });

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!open) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (panel.contains(target) || trigger.contains(target)) return;
      closePanel();
    },
    true,
  );

  return {
    isOpen: () => open,
    open: openPanel,
    close: closePanel,
    toggle,
  };
}
