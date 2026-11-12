import { visualPress } from "./feedback";

export interface AboutPanelController {
  isOpen: () => boolean;
  close: () => void;
}

export function createAboutPanel(): AboutPanelController {
  const btnAbout = document.getElementById("btn-about");
  const panel = document.getElementById("about-panel");

  if (!(btnAbout instanceof HTMLButtonElement) || !(panel instanceof HTMLDialogElement)) {
    return { isOpen: () => false, close: () => {} };
  }

  const setExpanded = (open: boolean): void => {
    btnAbout.setAttribute("aria-expanded", String(open));
  };

  const focusInPanel = (): void => {
    const closeBtn = document.getElementById("about-close");
    if (closeBtn instanceof HTMLElement) {
      closeBtn.focus({ preventScroll: true });
    } else {
      panel.focus({ preventScroll: true });
    }
  };

  const open = (): void => {
    if (panel.open) return;
    visualPress("btn-about");
    panel.showModal();
    setExpanded(true);
    requestAnimationFrame(focusInPanel);
  };

  const close = (): void => {
    if (!panel.open) return;
    panel.close();
  };

  btnAbout.addEventListener("click", () => {
    if (panel.open) close();
    else open();
  });

  panel.addEventListener("close", () => {
    setExpanded(false);
    panel.returnValue = "";
    requestAnimationFrame(() => btnAbout.focus({ preventScroll: true }));
  });

  document.getElementById("about-close")?.addEventListener("click", () => {
    visualPress("about-close");
  });

  return {
    isOpen: () => panel.open,
    close,
  };
}
