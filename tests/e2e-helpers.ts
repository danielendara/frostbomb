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

export async function readDownload(download: Download): Promise<{ name: string; sha: string }> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error(`Empty download: ${download.suggestedFilename()}`);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  await download.delete();
  return {
    name: download.suggestedFilename(),
    sha: createHash("sha256").update(body).digest("hex"),
  };
}
