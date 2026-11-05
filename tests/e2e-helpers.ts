import { createHash } from "node:crypto";
import { expect, type Download, type Page } from "@playwright/test";

const REGROW_WAIT_MS = 30_000;

/** Wait until #seed-display shows a different seed than `previousSeed`. */
export async function waitForSeedChange(page: Page, previousSeed: string): Promise<string> {
  await page.waitForFunction(
    (prev) => {
      const text = document.getElementById("seed-display")?.textContent?.trim() ?? "";
      return text.length > 0 && text !== "·····" && text !== prev;
    },
    previousSeed,
    { timeout: REGROW_WAIT_MS },
  );
  return (await page.locator("#seed-display").textContent())?.trim() ?? "";
}

/** Record #a11y-announcer text across debounced clear/set cycles. */
export async function installAnnouncerSpy(page: Page): Promise<void> {
  await page.locator("#a11y-announcer").evaluate((el) => {
    const heard: string[] = [];
    (window as unknown as { __heard: string[] }).__heard = heard;
    new MutationObserver(() => {
      if (el.textContent) heard.push(el.textContent);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
}

export async function expectAnnouncerIncludes(page: Page, text: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const heard = await page.evaluate(
          () => (window as unknown as { __heard?: string[] }).__heard,
        );
        if (heard?.some((message) => message.includes(text))) return true;
        return (await page.locator("#a11y-announcer").textContent())?.includes(text) ?? false;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

export function glowCheckbox(page: Page) {
  return page.locator('.tp-lblv:has-text("Glow") input');
}

/** Lab Tweakpane loads asynchronously; wait for the Glow binding before asserting. */
export async function waitForGlowCheckbox(page: Page) {
  await page.waitForFunction(
    () => {
      for (const row of document.querySelectorAll(".tp-lblv")) {
        if (!row.textContent?.includes("Glow")) continue;
        if (row.querySelector("input")) return true;
      }
      return false;
    },
    { timeout: 30_000 },
  );
  return glowCheckbox(page);
}

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
