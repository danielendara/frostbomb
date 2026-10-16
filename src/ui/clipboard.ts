import { setTemporaryLabel, visualPress } from "./feedback";

export interface CopyFeedback {
  pressIds: string[];
  labelIds: string[];
  successAnnounce: string;
  failureAnnounce: string;
}

/**
 * Copy text via the async Clipboard API, falling back to an off-screen
 * textarea + `execCommand("copy")`. Focus returns to the previously focused
 * element after the fallback. `announce` is injected so callers can suppress
 * announcements (e.g. while restoring history).
 */
export async function copyTextToClipboard(
  text: string,
  feedback: CopyFeedback,
  announce: (message: string) => void,
): Promise<boolean> {
  for (const id of feedback.pressIds) {
    visualPress(id);
  }

  const markCopied = () => {
    for (const id of feedback.labelIds) {
      setTemporaryLabel(id, "Copied!", "✓", false, true);
    }
    announce(feedback.successAnnounce);
  };

  const markFailed = () => {
    for (const id of feedback.labelIds) {
      setTemporaryLabel(id, "Failed", "✕", true);
    }
    announce(feedback.failureAnnounce);
  };

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      throw new Error("Clipboard API unavailable");
    }
    markCopied();
    return true;
  } catch (err) {
    console.warn("Clipboard API failed, trying legacy fallback:", err);
    try {
      const previousFocus = document.activeElement;
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.readOnly = true;
      textArea.setAttribute("aria-hidden", "true");
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      document.body.appendChild(textArea);
      let successful = false;
      try {
        textArea.focus({ preventScroll: true });
        textArea.select();
        successful = document.execCommand("copy");
      } finally {
        if (textArea.isConnected) textArea.remove();
        if (
          previousFocus instanceof HTMLElement &&
          previousFocus.isConnected &&
          previousFocus !== document.body
        ) {
          previousFocus.focus({ preventScroll: true });
        }
      }
      if (!successful) {
        throw new Error("execCommand copy failed");
      }
      markCopied();
      return true;
    } catch (fallbackErr) {
      console.error("Legacy fallback failed:", fallbackErr);
      markFailed();
      return false;
    }
  }
}
