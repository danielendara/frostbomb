export const WEBGL_CONTEXT_LOST_ANNOUNCEMENT =
  "Graphics context lost. Reload the crystal to continue.";

export function preventSilentContextLoss(event: Event): void {
  event.preventDefault();
}

export function showReloadCrystalAffordance(
  root: ParentNode = document,
): HTMLElement | null {
  const overlay = root.querySelector("#webgl-recovery");
  if (!(overlay instanceof HTMLElement)) return null;
  overlay.hidden = false;
  const button = root.querySelector("#btn-reload-crystal");
  if (button instanceof HTMLButtonElement) {
    button.focus();
  }
  return overlay;
}
