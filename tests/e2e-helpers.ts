import { createHash } from "node:crypto";
import type { Download, Page } from "@playwright/test";

// Captures whatever copyLink() writes to the clipboard without depending on
// real browser clipboard permissions (which are flaky in CI). Must be
// installed before the app script runs, so it's an init script rather than
// a post-load page.evaluate().
export async function stubClipboard(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __copiedText: string | null }).__copiedText = null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          (window as unknown as { __copiedText: string | null }).__copiedText = text;
          return Promise.resolve();
        },
      },
    });
  });
}

export async function readDownload(
  download: Download,
): Promise<{ name: string; sha: string; body: Buffer }> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error(`Empty download: ${download.suggestedFilename()}`);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  await download.delete();
  return {
    name: download.suggestedFilename(),
    sha: createHash("sha256").update(body).digest("hex"),
    body,
  };
}

export interface HeldMeshExport {
  releaseExport: () => void;
  requested: Promise<void>;
}

/** Holds dynamic `mesh-export.ts` import until `releaseExport()` so tests can
 * regrow or toggle modes while the exporter is still loading. */
export async function withHeldMeshExport(
  page: Page,
  fn: (ctx: HeldMeshExport) => Promise<void>,
): Promise<void> {
  let releaseExport!: () => void;
  const exportGate = new Promise<void>((resolve) => {
    releaseExport = resolve;
  });
  let markRequested!: () => void;
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve;
  });
  await page.route(/mesh-export\.ts/, async (route) => {
    markRequested();
    await exportGate;
    await route.continue();
  });
  try {
    await fn({ releaseExport, requested });
  } finally {
    await page.unroute(/mesh-export\.ts/);
  }
}
