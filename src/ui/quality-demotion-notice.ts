import { testTimeoutOverride } from "./test-timeout";

export const QUALITY_DEMOTION_NOTICE_ID = "quality-demotion-notice";

export const QUALITY_DEMOTION_NOTICE_MESSAGE =
  "Switched to Lite for smoother performance";

const DEFAULT_DISMISS_MS = 4000;
const FADE_MS = 350;

function dismissMs(): number {
  return testTimeoutOverride(
    "__FROSTBOMB_QUALITY_DEMOTION_NOTICE_MS__",
    DEFAULT_DISMISS_MS,
  );
}

let visible = false;
let dismissTimer: number | undefined;
let hideTimer: number | undefined;

function clearTimers(): void {
  if (dismissTimer !== undefined) {
    clearTimeout(dismissTimer);
    dismissTimer = undefined;
  }
  if (hideTimer !== undefined) {
    clearTimeout(hideTimer);
    hideTimer = undefined;
  }
}

function hideNotice(el: HTMLElement, prefersReducedMotion: boolean): void {
  el.classList.remove("is-visible");
  const fadeMs = prefersReducedMotion ? 0 : FADE_MS;
  hideTimer = window.setTimeout(() => {
    el.hidden = true;
    el.textContent = "";
    visible = false;
    hideTimer = undefined;
  }, fadeMs);
}

/**
 * Shows a brief notice when the frame-time governor demotes RICH to LITE.
 * Does not start the dismiss timer; call {@link beginQualityDemotionNoticeDismiss} after tier work completes.
 */
export function showQualityDemotionNotice(prefersReducedMotion = false): void {
  if (prefersReducedMotion) return;
  if (visible) return;

  const el = document.getElementById(QUALITY_DEMOTION_NOTICE_ID);
  if (!el) return;

  visible = true;
  clearTimers();

  el.textContent = QUALITY_DEMOTION_NOTICE_MESSAGE;
  el.hidden = false;
  el.classList.remove("is-visible");
  void el.offsetWidth;
  el.classList.add("is-visible");
}

/** Starts the auto-dismiss timer after applyTier / updateCamera have finished. */
export function beginQualityDemotionNoticeDismiss(prefersReducedMotion = false): void {
  if (prefersReducedMotion || !visible) return;

  const el = document.getElementById(QUALITY_DEMOTION_NOTICE_ID);
  if (!el || el.hidden) return;

  if (dismissTimer !== undefined) clearTimeout(dismissTimer);
  dismissTimer = window.setTimeout(() => {
    dismissTimer = undefined;
    hideNotice(el, prefersReducedMotion);
  }, dismissMs());
}

/** Resets module state between unit tests. */
export function resetQualityDemotionNoticeForTests(): void {
  clearTimers();
  visible = false;
  const el = document.getElementById(QUALITY_DEMOTION_NOTICE_ID);
  if (el) {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("is-visible");
  }
}
