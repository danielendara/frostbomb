/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "../../src/ui/clipboard";

const FEEDBACK = {
  pressIds: ["btn-copy"],
  labelIds: ["btn-copy"],
  successAnnounce: "copied ok",
  failureAnnounce: "copy failed",
};

function setClipboard(writeText: ReturnType<typeof vi.fn> | undefined, secure: boolean) {
  Object.defineProperty(navigator, "clipboard", {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
  Object.defineProperty(window, "isSecureContext", { value: secure, configurable: true });
}

describe("copyTextToClipboard", () => {
  const announce = vi.fn();
  let execCommand: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    document.body.innerHTML = `
      <button id="other">Other</button>
      <button id="btn-copy">
        <span class="action-btn__icon">⧉</span>
        <span class="action-btn__label">Copy</span>
      </button>`;
    execCommand = vi.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = execCommand;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const label = () => document.querySelector("#btn-copy .action-btn__label")?.textContent;

  it("uses the Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText, true);
    expect(await copyTextToClipboard("hello", FEEDBACK, announce)).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(execCommand).not.toHaveBeenCalled();
    expect(label()).toBe("Copied!");
    expect(announce).toHaveBeenCalledWith("copied ok");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back to execCommand in an insecure context", async () => {
    const writeText = vi.fn();
    setClipboard(writeText, false);
    expect(await copyTextToClipboard("hello", FEEDBACK, announce)).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(label()).toBe("Copied!");
    expect(announce).toHaveBeenCalledWith("copied ok");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back when the Clipboard API rejects", async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error("denied")), true);
    expect(await copyTextToClipboard("hello", FEEDBACK, announce)).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("reports failure when execCommand returns false", async () => {
    setClipboard(undefined, false);
    execCommand.mockReturnValue(false);
    expect(await copyTextToClipboard("hello", FEEDBACK, announce)).toBe(false);
    expect(label()).toBe("Failed");
    expect(announce).toHaveBeenCalledWith("copy failed");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("reports failure and removes the textarea when execCommand throws", async () => {
    setClipboard(undefined, false);
    execCommand.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(await copyTextToClipboard("hello", FEEDBACK, announce)).toBe(false);
    expect(announce).toHaveBeenCalledWith("copy failed");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("restores focus to the previously focused element after fallback", async () => {
    setClipboard(undefined, false);
    const other = document.getElementById("other") as HTMLElement;
    other.focus();
    expect(document.activeElement).toBe(other);
    await copyTextToClipboard("hello", FEEDBACK, announce);
    expect(document.activeElement).toBe(other);
  });
});
