import { announce } from "./announcer";
import { setTemporaryLabel, visualPress } from "./feedback";
import { reportClientError } from "./client-error";

const inflight = new Set<string>();

export function isExportBusy(buttonId: string): boolean {
  return inflight.has(buttonId);
}

// Minimal surface `runExportAction` needs to pause auto-rotate for the
// duration of an export. `scene`'s exported interface already satisfies this
// shape, but exports don't take a hard dependency on the scene module.
export interface ExportRotateControl {
  readonly isAutoRotateEnabled: boolean;
  setAutoRotate(enabled: boolean): void;
}

export async function runExportAction(
  buttonId: string,
  messages: { start: string; success: string; failure: string },
  work: () => void | Promise<void>,
  rotate?: ExportRotateControl,
): Promise<boolean> {
  if (inflight.has(buttonId)) return false;
  inflight.add(buttonId);

  const btn = document.getElementById(buttonId);
  if (btn instanceof HTMLButtonElement) {
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
  }

  // Captures/restores the literal prior flag (rather than assuming "on")
  // so this nests correctly with anything else that may already have
  // rotation off — restoring never turns rotation back on unless it was
  // actually on when the export started.
  const wasAutoRotating = rotate?.isAutoRotateEnabled ?? false;
  if (rotate && wasAutoRotating) {
    rotate.setAutoRotate(false);
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
    reportClientError("export", err);
    setTemporaryLabel(buttonId, "Failed", "✕", true);
    announce(messages.failure);
    return false;
  } finally {
    inflight.delete(buttonId);
    if (btn instanceof HTMLButtonElement) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    }
    if (rotate && wasAutoRotating) {
      rotate.setAutoRotate(true);
    }
  }
}
