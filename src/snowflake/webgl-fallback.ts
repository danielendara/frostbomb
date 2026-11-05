import type { Scene } from "./scene";
import { GLOW_MODE } from "../ui/mode-toggle";

export const WEBGL_UNAVAILABLE_ANNOUNCEMENT =
  "3D view unavailable on this device. Rotate, view reset and PNG, wallpaper, SVG and 3D exports are disabled.";
const WEBGL_UNAVAILABLE_NOTE = "3D view unavailable on this device";
const WEBGL_FALLBACK_ALT =
  "A stellar dendrite snowflake: six branching arms around a small hexagonal core, rendered in pale ice-grey on a dark blue night sky.";

/** Buttons that need the 3D scene. Their keyboard shortcuts are gated in main.ts. */
const WEBGL_ONLY_BUTTON_IDS = [
  "btn-rotate",
  "btn-reset",
  "btn-save",
  "btn-save-wallpaper",
  "btn-save-svg",
  "btn-save-3d",
] as const;

/** three r186 is WebGL2-only, so a missing WebGL2 context is the same as no WebGL. */
export function hasWebGL2(doc: Document = document): boolean {
  try {
    return doc.createElement("canvas").getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

/** Inert stand-in so the Field Guide, Nakaya diagram and keyboard wiring run unchanged. */
export function createInertScene(): Scene {
  const flags: { rotate: boolean; pink: boolean; prism: boolean; glow: boolean } = {
    rotate: false,
    pink: false,
    prism: false,
    glow: GLOW_MODE.defaultEnabled,
  };
  return {
    isAutoRotateEnabled: false,
    get isPinkModeEnabled() {
      return flags.pink;
    },
    get isPrismModeEnabled() {
      return flags.prism;
    },
    get isGlowEnabled() {
      return flags.glow;
    },
    qualityTier: "lite",
    glintMode: "static",
    start() {},
    dispose() {},
    setAutoRotate() {},
    setPinkMode(enabled: boolean) {
      flags.pink = enabled;
    },
    setPrismMode(enabled: boolean) {
      flags.prism = enabled;
    },
    setGlowMode(enabled: boolean) {
      flags.glow = enabled;
    },
    setPhotoMode() {},
    setQualityTier: () => "lite",
    updateFlake() {},
    resetView() {},
    rotateView() {},
    resize() {},
  } as unknown as Scene;
}

/** Swaps the canvas for our own static render (fetched only here) and disables 3D-only buttons. */
export function showWebglFallback(canvas: HTMLCanvasElement, doc: Document = document): void {
  const figure = doc.createElement("figure");
  figure.id = "webgl-fallback";
  const img = doc.createElement("img");
  img.src = "/fallback-flake.webp";
  img.alt = WEBGL_FALLBACK_ALT;
  const caption = doc.createElement("figcaption");
  caption.textContent = WEBGL_UNAVAILABLE_NOTE;
  figure.append(img, caption);
  canvas.hidden = true;
  canvas.after(figure);
  for (const id of WEBGL_ONLY_BUTTON_IDS) {
    const button = doc.getElementById(id);
    if (button instanceof HTMLButtonElement) button.disabled = true;
  }
}
