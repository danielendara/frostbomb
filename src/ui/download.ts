/** Gap between sequential blob downloads so the second click is not dropped. */
export const DOWNLOAD_GAP_MS = 100;

/** Keep object URLs alive until the browser has started the save. */
export const OBJECT_URL_REVOKE_MS = 2000;

function overrideMs(key: string, fallback: number): number {
  const value = (window as unknown as Record<string, unknown>)[key];
  return typeof value === "number" ? value : fallback;
}

function gapMs(): number {
  return overrideMs("__FROSTBOMB_DOWNLOAD_GAP_MS__", DOWNLOAD_GAP_MS);
}

function revokeMs(): number {
  return overrideMs("__FROSTBOMB_OBJECT_URL_REVOKE_MS__", OBJECT_URL_REVOKE_MS);
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

export async function downloadObjectUrls(
  files: { filename: string; href: string }[],
): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    if (i > 0) await downloadGap();
    downloadHref(files[i].filename, files[i].href);
  }
}

if (import.meta.env.DEV) {
  (
    window as Window & {
      __FROSTBOMB_DOWNLOAD_OBJECT_URLS__?: typeof downloadObjectUrls;
    }
  ).__FROSTBOMB_DOWNLOAD_OBJECT_URLS__ = downloadObjectUrls;
}
