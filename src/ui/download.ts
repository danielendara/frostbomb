import { testTimeoutOverride } from "./test-timeout";

/** Gap between sequential blob downloads so the second click is not dropped. */
const DOWNLOAD_GAP_MS = 100;

/** Keep object URLs alive until the browser has started the save. */
const OBJECT_URL_REVOKE_MS = 2000;

function gapMs(): number {
  return testTimeoutOverride("__FROSTBOMB_DOWNLOAD_GAP_MS__", DOWNLOAD_GAP_MS);
}

function revokeMs(): number {
  return testTimeoutOverride("__FROSTBOMB_OBJECT_URL_REVOKE_MS__", OBJECT_URL_REVOKE_MS);
}

export function downloadHref(filename: string, href: string): void {
  const link = document.createElement("a");
  link.download = filename;
  link.href = href;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();

  const cleanupDelay = href.startsWith("blob:") ? revokeMs() : 0;
  window.setTimeout(() => {
    link.remove();
    if (href.startsWith("blob:")) {
      URL.revokeObjectURL(href);
    }
  }, cleanupDelay);
}

function downloadGap(ms = gapMs()): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Seed and habit captured with the geometry, before export awaits anything. */
export interface ExportIdentity {
  habit: string;
  seed: string;
}

export function formatExportFileName(identity: ExportIdentity, extension: string): string {
  const habit = identity.habit.replace(/_/g, "-");
  return `frostbomb-${habit}-${identity.seed}.${extension}`;
}

/**
 * Names are fixed from `identity` before the encoder module loads and before
 * encoding. Callers can regrow while this is in flight; the files still
 * describe `snapshot`.
 */
export async function filesForExportIdentity<T>(
  identity: ExportIdentity,
  snapshot: T,
  loadEncoder: () => Promise<(data: T) => Promise<{ stl: Blob; glb: Blob }>>,
): Promise<{ filename: string; blob: Blob }[]> {
  const captured: ExportIdentity = { habit: identity.habit, seed: identity.seed };
  const stlName = formatExportFileName(captured, "stl");
  const glbName = formatExportFileName(captured, "glb");
  const encode = await loadEncoder();
  const models = await encode(snapshot);
  return [
    { filename: stlName, blob: models.stl },
    { filename: glbName, blob: models.glb },
  ];
}

export async function downloadObjectUrls(
  files: { filename: string; href: string }[],
): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    if (i > 0) await downloadGap();
    downloadHref(files[i].filename, files[i].href);
  }
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  (
    window as Window & {
      __FROSTBOMB_DOWNLOAD_OBJECT_URLS__?: typeof downloadObjectUrls;
    }
  ).__FROSTBOMB_DOWNLOAD_OBJECT_URLS__ = downloadObjectUrls;
}
