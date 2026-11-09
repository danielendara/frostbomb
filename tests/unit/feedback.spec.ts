/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from "vitest";
import { setTemporaryLabel } from "../../src/ui/feedback";

afterEach(() => {
  vi.useRealTimers();
  delete window.__FROSTBOMB_LABEL_TIMEOUT__;
});

it("restarts temporary feedback without storing timer ids in the DOM", () => {
  vi.useFakeTimers();
  window.__FROSTBOMB_LABEL_TIMEOUT__ = 100;
  document.body.innerHTML = '<button id="action" aria-label="Original"><span class="action-btn__label">Original</span></button>';
  const button = document.getElementById("action")!;
  setTemporaryLabel("action", "First");
  expect(button.hasAttribute("data-timeout-id")).toBe(false);
  vi.advanceTimersByTime(80);
  setTemporaryLabel("action", "Second");
  vi.advanceTimersByTime(20);
  expect(button.textContent).toBe("Second");
  vi.advanceTimersByTime(80);
  expect(button.textContent).toBe("Original");
  expect(button.getAttribute("aria-label")).toBe("Original");
});
