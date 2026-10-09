/**
 * Web Share of the current crystal: the PNG plus the share link, through the
 * phone's native share sheet. Feature-detected, so desktop browsers without
 * file sharing never see the button and keep Copy link.
 *
 * `navigator.share` must run inside the tap's transient activation, so the
 * only thing awaited before it is `canvas.toBlob`. The caller renders the
 * frame and builds the opaque canvas in the same synchronous block.
 */

export type ShareOutcome = "shared" | "cancelled" | "failed";

/** The slice of `Navigator` this module touches, so tests can pass a fake. */
export interface ShareNavigator {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data?: ShareData) => boolean;
}

/** True when the browser can share an image file (not just a URL). */
export function canShareFiles(nav: ShareNavigator | undefined): boolean {
  if (!nav || typeof nav.share !== "function" || typeof nav.canShare !== "function") {
    return false;
  }
  try {
    const probe = new File([new Uint8Array(1)], "probe.png", { type: "image/png" });
    return nav.canShare({ files: [probe] }) === true;
  } catch {
    return false;
  }
}

/**
 * A copy of `source` drawn onto an offscreen 2D canvas pre-filled with
 * `fill`. The WebGL canvas clears to alpha 0 (the dark backdrop is CSS), so a
 * shared PNG would otherwise be a transparent white crystal that vanishes on
 * a light chat bubble. Synchronous: call it in the same task as the render.
 */
export function drawOnOpaqueCanvas(
  source: HTMLCanvasElement,
  fill: string,
  createCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
): HTMLCanvasElement {
  const out = createCanvas();
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, 0, 0);
  return out;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export interface ShareSnowflakeOptions {
  /** Opaque canvas from `drawOnOpaqueCanvas`. */
  canvas: HTMLCanvasElement;
  fileName: string;
  title: string;
  text: string;
  url: string;
  nav: ShareNavigator;
  /** Called once with the error for any failure that is not the user cancelling. */
  onError?: (err: unknown) => void;
}

/**
 * Share the PNG + link. `'cancelled'` (the user dismissed the sheet,
 * `AbortError`) is silent and never reported; every other failure, including
 * `NotAllowedError`, is `'failed'` and goes to `onError` once.
 */
export async function shareSnowflake(options: ShareSnowflakeOptions): Promise<ShareOutcome> {
  const { canvas, fileName, title, text, url, nav, onError } = options;
  try {
    // The only await before share(): toBlob keeps the tap's user activation.
    const blob = await canvasToPngBlob(canvas);
    if (!blob) throw new Error("Could not encode snowflake PNG");
    const file = new File([blob], fileName, { type: "image/png" });
    if (typeof nav.share !== "function") throw new Error("Web Share unavailable");
    await nav.share({ files: [file], title, text, url });
    return "shared";
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return "cancelled";
    onError?.(err);
    return "failed";
  }
}
