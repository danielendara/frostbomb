import { visualPress } from "./feedback";

export interface AboutPanelController {
  isOpen(): boolean;
  close(): void;
}

export function createAboutPanel(reducedMotion: () => boolean): AboutPanelController {
  const dialog = document.getElementById("about-panel");
  const openBtn = document.getElementById("btn-about");
  const closeBtn = document.getElementById("about-close");

  if (!(dialog instanceof HTMLDialogElement) || !(openBtn instanceof HTMLButtonElement)) {
    return { isOpen: () => false, close: () => {} };
  }

  const syncExpanded = (expanded: boolean) => {
    openBtn.setAttribute("aria-expanded", String(expanded));
  };

  const close = () => {
    if (!dialog.open) return;
    dialog.close();
  };

  const open = () => {
    if (dialog.open) return;
    dialog.showModal();
    syncExpanded(true);
    if (!reducedMotion()) {
      dialog.classList.remove("about-panel--enter");
      void dialog.offsetWidth;
      dialog.classList.add("about-panel--enter");
    }
    requestAnimationFrame(() => {
      dialog.focus({ preventScroll: true });
    });
  };

  dialog.addEventListener("close", () => {
    syncExpanded(false);
    dialog.classList.remove("about-panel--enter");
    openBtn.focus({ preventScroll: true });
  });

  dialog.addEventListener("animationend", (e) => {
    if (e.target === dialog && e.animationName === "about-panel-in") {
      dialog.classList.remove("about-panel--enter");
    }
  });

  openBtn.addEventListener("click", () => {
    visualPress("btn-about");
    if (dialog.open) close();
    else open();
  });

  closeBtn?.addEventListener("click", () => {
    visualPress("about-close");
    close();
  });

  return {
    isOpen: () => dialog.open,
    close,
  };
}
