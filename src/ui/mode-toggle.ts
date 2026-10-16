import { SHARE_PARAM_PINK, SHARE_PARAM_PRISM, type ShareFlagName } from "../share-url-params";

/** The look modes that have a toggle button, a body class and a share-URL flag. */
export type ShareModeKind = "pink" | "prism";

export interface ModeToggleSpec {
  buttonId: string;
  /** Capitalised name used in the aria-label and the announcement, e.g. "Pink". */
  label: string;
  /** Keyboard shortcut shown in the aria-label and title, e.g. "P". */
  key: string;
  bodyClass: string;
  param: ShareFlagName;
}

export const MODE_TOGGLES: Record<ShareModeKind, ModeToggleSpec> = {
  pink: { buttonId: "btn-pink", label: "Pink", key: "P", bodyClass: "pink-mode", param: SHARE_PARAM_PINK },
  prism: { buttonId: "btn-prism", label: "Prism", key: "M", bodyClass: "prism-mode", param: SHARE_PARAM_PRISM },
};

/** Reflect a mode's on/off state on its toggle button (aria-pressed, `active` class, label, title). */
export function syncModeToggleButton(btn: HTMLElement | null, spec: ModeToggleSpec, enabled: boolean): void {
  if (!btn) return;
  btn.setAttribute("aria-pressed", enabled.toString());
  btn.classList.toggle("active", enabled);
  btn.setAttribute("aria-label", `${spec.label} Mode (${spec.key})`);
  btn.title = `Toggle ${spec.label.toLowerCase()} mode (${spec.key}) - current: ${enabled ? "active" : "inactive"}`;
}
