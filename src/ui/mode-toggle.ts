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

/** Material params for Glow mode. On is today's look; off drops the emissive and opacity flattening. */
export const GLOW_LOOK = {
  on: { emissiveIntensity: 0.25, opacity: 0.9, transparent: true },
  off: { emissiveIntensity: 0, opacity: 1, transparent: false },
} as const;

/**
 * Glow is Lab-only (no toolbar button). Toggle with **O** or the Lab checkbox;
 * share links and localStorage carry `glow=`.
 */
export const GLOW_MODE = { label: "Glow", defaultEnabled: false } as const;

/** Apply Glow on/off to a material (static, no transition). Emissive colour stays with Pink/Prism. */
export function applyGlowLook(
  material: {
    emissiveIntensity: number;
    opacity: number;
    transparent: boolean;
    needsUpdate: boolean;
  },
  enabled: boolean,
): void {
  const look = enabled ? GLOW_LOOK.on : GLOW_LOOK.off;
  const transparentChanged = material.transparent !== look.transparent;
  material.emissiveIntensity = look.emissiveIntensity;
  material.opacity = look.opacity;
  material.transparent = look.transparent;
  if (transparentChanged) material.needsUpdate = true;
}
