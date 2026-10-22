import { formatExportFileName, type ExportIdentity } from "./download";
import { drawOnOpaqueCanvas } from "./share-image";

/**
 * Screen-sized wallpaper export (#377): one tap for a crisp PNG in the
 * device's own shape, instead of the live canvas at its working resolution.
 */

/** Hard ceiling on the long edge, whatever the GPU allows. */
export const MAX_WALLPAPER_EDGE = 4096;
/** Pixel-ratio ceiling: a 4× phone still yields a 3× image. */
const MAX_WALLPAPER_DPR = 3;

export interface WallpaperSizeInput {
  /** `screen.width` / `screen.height`, in CSS pixels (either order). */
  screenW: number;
  screenH: number;
  dpr: number;
  orientation: "portrait" | "landscape";
  /** `renderer.capabilities.maxTextureSize`. */
  maxTexture: number;
}

export interface WallpaperSize {
  width: number;
  height: number;
}

/**
 * Output size in physical pixels: the screen × min(dpr, 3), oriented to match
 * the current orientation, with the long edge clamped to
 * `min(maxTexture, 4096)` and the aspect preserved.
 */
export function wallpaperSize(input: WallpaperSizeInput): WallpaperSize {
  const dpr = Number.isFinite(input.dpr) && input.dpr > 0 ? Math.min(input.dpr, MAX_WALLPAPER_DPR) : 1;
  const short = Math.max(1, Math.min(input.screenW, input.screenH));
  const long = Math.max(1, Math.max(input.screenW, input.screenH));
  let shortPx = short * dpr;
  let longPx = long * dpr;

  const maxEdge = Math.max(
    1,
    Math.min(Number.isFinite(input.maxTexture) && input.maxTexture > 0 ? input.maxTexture : MAX_WALLPAPER_EDGE, MAX_WALLPAPER_EDGE),
  );
  if (longPx > maxEdge) {
    const scale = maxEdge / longPx;
    longPx = maxEdge;
    shortPx *= scale;
  }

  const a = Math.max(1, Math.round(shortPx));
  const b = Math.max(1, Math.round(longPx));
  return input.orientation === "portrait" ? { width: a, height: b } : { width: b, height: a };
}

/** `frostbomb-<habit>-<seed>-wallpaper.png` */
export function wallpaperFileName(identity: ExportIdentity): string {
  return formatExportFileName(identity, "png").replace(/\.png$/, "-wallpaper.png");
}

/** The slice of the scene `captureWallpaper` drives, so tests can pass a fake. */
export interface WallpaperScene {
  renderer: {
    setPixelRatio(ratio: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    domElement: HTMLCanvasElement;
  };
  camera: {
    aspect: number;
    position: { z: number };
    updateProjectionMatrix(): void;
  };
  composer: {
    setSize(width: number, height: number): void;
    render(): void;
  };
  /** The scene's own `updateCamera` path: camera, pixel ratio, renderer and composer size. */
  resize(): void;
}

/**
 * Render the current frame at `size` and copy it onto an offscreen 2D canvas
 * pre-filled with `fill` (the page's solid `--paper` colour), so the PNG is
 * opaque and bloom glow isn't lost in transparent pixels.
 *
 * One synchronous block: the live renderer is resized, rendered, copied and
 * restored (in `finally`, even if `render` throws) before anything can await,
 * so no frame is ever presented at the temporary size. The caller encodes the
 * returned 2D canvas afterwards — `toBlob` snapshots the bitmap when called,
 * so it is safe to restore first.
 */
export function captureWallpaper(
  scene: WallpaperScene,
  size: WallpaperSize,
  fill: string,
  createCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
): HTMLCanvasElement {
  const { width, height } = size;
  try {
    // Don't touch the visible canvas's CSS size (updateStyle = false).
    scene.renderer.setPixelRatio(1);
    scene.renderer.setSize(width, height, false);
    const aspect = width / height;
    scene.camera.aspect = aspect;
    // Same framing rule as the scene's updateCamera, so the crystal sits identically.
    scene.camera.position.z = aspect < 1 ? 10 / aspect : 10;
    scene.camera.updateProjectionMatrix();
    scene.composer.setSize(width, height);

    scene.composer.render();

    return drawOnOpaqueCanvas(scene.renderer.domElement, fill, createCanvas);
  } finally {
    scene.resize();
  }
}
