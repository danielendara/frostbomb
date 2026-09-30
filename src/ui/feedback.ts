const DOM_CACHE = new Map<string, HTMLElement>();
const ROW_CACHE = new Map<string, HTMLElement>();
const LAST_TEXT = new Map<string, string>();
const LAST_ARIA = new Map<string, string>();

export function setText(id: string, value: string): void {
  if (LAST_TEXT.get(id) === value) return;

  let el = DOM_CACHE.get(id);
  if (!el) {
    el = document.getElementById(id) || undefined;
    if (el) DOM_CACHE.set(id, el);
  }

  if (el) {
    el.textContent = value;
    LAST_TEXT.set(id, value);
  }
}

export function updateRowAria(ddId: string, label: string, value: string): void {
  let row = ROW_CACHE.get(ddId);
  if (!row) {
    const dd = document.getElementById(ddId);
    row = (dd?.closest(".field-notes__row") as HTMLElement) || undefined;
    if (row) ROW_CACHE.set(ddId, row);
  }

  if (row) {
    const isButton = row.getAttribute("role") === "button";
    const interactionHint = isButton ? ". Click to learn more in the field guide." : ".";
    const ariaLabel = `${label}: ${value}${interactionHint}`;

    if (LAST_ARIA.get(ddId) !== ariaLabel) {
      row.setAttribute("aria-label", ariaLabel);
      LAST_ARIA.set(ddId, ariaLabel);
    }
  }
}

export function visualPress(idOrEl: string | HTMLElement): void {
  const el = typeof idOrEl === "string" ? document.getElementById(idOrEl) : idOrEl;
  if (!el) return;
  el.classList.remove("btn-press");
  void (el as HTMLElement).offsetWidth; // Trigger reflow
  el.classList.add("btn-press");
}

export function setTemporaryLabel(
  id: string,
  tempText: string,
  tempIcon?: string,
  isError = false,
  isSuccess = false
): void {
  const btn = document.getElementById(id);
  if (!btn) return;

  const labelEl = btn.querySelector(".action-btn__label, #seed-display, .refresh__label") as HTMLElement;
  const iconEl = btn.querySelector(".action-btn__icon, .seed-btn__icon, .refresh__icon") as HTMLElement;

  if (!labelEl) return;

  // Prevent race condition: store original values if not already stored
  if (!labelEl.hasAttribute("data-original")) {
    labelEl.setAttribute("data-original", labelEl.textContent || "");
  }
  if (iconEl && !iconEl.hasAttribute("data-original")) {
    iconEl.setAttribute("data-original", iconEl.textContent || "");
  }
  if (!btn.hasAttribute("data-original-aria-label")) {
    btn.setAttribute("data-original-aria-label", btn.getAttribute("aria-label") || "");
  }
  if (!btn.hasAttribute("data-original-title")) {
    btn.setAttribute("data-original-title", btn.getAttribute("title") || "");
  }

  labelEl.textContent = tempText;
  if (iconEl && tempIcon) iconEl.textContent = tempIcon;

  // Also temporarily update aria-label and title/tooltip
  btn.setAttribute("aria-label", tempText);
  btn.setAttribute("title", tempText);

  if (isError) {
    btn.classList.add("btn--error");
    btn.classList.remove("btn--success");
  } else if (isSuccess) {
    btn.classList.add("btn--success");
    btn.classList.remove("btn--error");
  } else {
    btn.classList.remove("btn--error");
    btn.classList.remove("btn--success");
  }

  const existingTimeout = btn.getAttribute("data-timeout-id");
  if (existingTimeout) clearTimeout(parseInt(existingTimeout));

  const labelDuration =
    (window as any).__FROSTBOMB_LABEL_TIMEOUT__ !== undefined
      ? (window as any).__FROSTBOMB_LABEL_TIMEOUT__
      : 2000;

  const timeoutId = window.setTimeout(() => {
    const originalLabel = labelEl.getAttribute("data-original");
    if (originalLabel !== null) {
      labelEl.textContent = originalLabel;
      labelEl.removeAttribute("data-original");
    }

    if (iconEl) {
      const originalIcon = iconEl.getAttribute("data-original");
      if (originalIcon !== null) {
        iconEl.textContent = originalIcon;
        iconEl.removeAttribute("data-original");
      }
    }

    const origAria = btn.getAttribute("data-original-aria-label");
    if (origAria !== null) {
      if (origAria) {
        btn.setAttribute("aria-label", origAria);
      } else {
        btn.removeAttribute("aria-label");
      }
      btn.removeAttribute("data-original-aria-label");
    }

    const origTitle = btn.getAttribute("data-original-title");
    if (origTitle !== null) {
      if (origTitle) {
        btn.setAttribute("title", origTitle);
      } else {
        btn.removeAttribute("title");
      }
      btn.removeAttribute("data-original-title");
    }

    btn.classList.remove("btn--error");
    btn.classList.remove("btn--success");
    btn.removeAttribute("data-timeout-id");
  }, labelDuration);

  btn.setAttribute("data-timeout-id", timeoutId.toString());
}

export function triggerFlash(prefersReducedMotion = false): void {
  if (prefersReducedMotion) return;
  const el = document.getElementById("flash-overlay");
  if (!el) return;
  el.classList.remove("camera-flash");
  void el.offsetWidth;
  el.classList.add("camera-flash");
}
