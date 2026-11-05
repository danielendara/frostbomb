/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QUALITY_DEMOTION_NOTICE_ID,
  QUALITY_DEMOTION_NOTICE_MESSAGE,
  beginQualityDemotionNoticeDismiss,
  resetQualityDemotionNoticeForTests,
  showQualityDemotionNotice,
} from "../../src/ui/quality-demotion-notice.ts";

describe("showQualityDemotionNotice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div id="${QUALITY_DEMOTION_NOTICE_ID}" class="quality-demotion-notice" role="status" aria-live="polite" hidden></div>`;
    resetQualityDemotionNoticeForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as Window & { __FROSTBOMB_QUALITY_DEMOTION_NOTICE_MS__?: number })
      .__FROSTBOMB_QUALITY_DEMOTION_NOTICE_MS__;
    resetQualityDemotionNoticeForTests();
  });

  it("shows the message with live-region semantics and auto-dismisses", () => {
    showQualityDemotionNotice(false);
    beginQualityDemotionNoticeDismiss(false);

    const notice = document.getElementById(QUALITY_DEMOTION_NOTICE_ID)!;
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.getAttribute("aria-live")).toBe("polite");
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toBe(QUALITY_DEMOTION_NOTICE_MESSAGE);
    expect(notice.classList.contains("is-visible")).toBe(true);

    vi.advanceTimersByTime(3999);
    expect(notice.hidden).toBe(false);

    vi.advanceTimersByTime(1);
    expect(notice.classList.contains("is-visible")).toBe(false);

    vi.advanceTimersByTime(350);
    expect(notice.hidden).toBe(true);
    expect(notice.textContent).toBe("");
  });

  it("respects a shorter dismiss override for tests in dev", () => {
    (window as Window & { __FROSTBOMB_QUALITY_DEMOTION_NOTICE_MS__?: number }).__FROSTBOMB_QUALITY_DEMOTION_NOTICE_MS__ = 500;
    showQualityDemotionNotice(false);
    beginQualityDemotionNoticeDismiss(false);
    const notice = document.getElementById(QUALITY_DEMOTION_NOTICE_ID)!;

    vi.advanceTimersByTime(500);
    expect(notice.classList.contains("is-visible")).toBe(false);
    vi.advanceTimersByTime(350);
    expect(notice.hidden).toBe(true);
  });

  it("does not repeat while the same drop notice is visible", () => {
    showQualityDemotionNotice(false);
    showQualityDemotionNotice(false);
    beginQualityDemotionNoticeDismiss(false);

    const notice = document.getElementById(QUALITY_DEMOTION_NOTICE_ID)!;
    expect(notice.textContent).toBe(QUALITY_DEMOTION_NOTICE_MESSAGE);

    vi.advanceTimersByTime(4000);
    vi.advanceTimersByTime(350);
    expect(notice.hidden).toBe(true);

    showQualityDemotionNotice(false);
    beginQualityDemotionNoticeDismiss(false);
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toBe(QUALITY_DEMOTION_NOTICE_MESSAGE);
  });

  it("does not show the notice when reduced motion is preferred", () => {
    showQualityDemotionNotice(true);
    beginQualityDemotionNoticeDismiss(true);
    const notice = document.getElementById(QUALITY_DEMOTION_NOTICE_ID)!;
    expect(notice.hidden).toBe(true);
    expect(notice.textContent).toBe("");
    vi.advanceTimersByTime(10_000);
    expect(notice.hidden).toBe(true);
  });

  it("mutation guard: notice must auto-dismiss (visible flag clears)", () => {
    showQualityDemotionNotice(false);
    beginQualityDemotionNoticeDismiss(false);
    vi.advanceTimersByTime(4350);
    const notice = document.getElementById(QUALITY_DEMOTION_NOTICE_ID)!;
    expect(notice.hidden).toBe(true);

    showQualityDemotionNotice(false);
    beginQualityDemotionNoticeDismiss(false);
    expect(notice.hidden).toBe(false);
  });
});
