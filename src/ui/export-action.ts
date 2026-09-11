import { announce } from "./announcer";
import { setTemporaryLabel, visualPress } from "./feedback";

const inflight = new Set<string>();

export function isExportBusy(buttonId: string): boolean {
  return inflight.has(buttonId);
}

export async function runExportAction(
  buttonId: string,
  messages: { start: string; success: string; failure: string },
  work: () => void | Promise<void>,
): Promise<boolean> {
  if (inflight.has(buttonId)) return false;
  inflight.add(buttonId);

  const btn = document.getElementById(buttonId);
  if (btn instanceof HTMLButtonElement) {
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
  }

  setTemporaryLabel(buttonId, "Saving...", "⌛");
  visualPress(buttonId);
  announce(messages.start);

  try {
    await work();
    setTemporaryLabel(buttonId, "Saved!", "✓", false, true);
    announce(messages.success);
    return true;
  } catch (err) {
    console.error(messages.failure, err);
    setTemporaryLabel(buttonId, "Failed", "✕", true);
    announce(messages.failure);
    return false;
  } finally {
    inflight.delete(buttonId);
    if (btn instanceof HTMLButtonElement) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    }
  }
}
