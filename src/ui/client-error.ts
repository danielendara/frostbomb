/**
 * Browser error reporting (#356). Sends one small, allowlisted report per
 * event to `POST /api/client-error`, which the Worker writes to Workers Logs.
 *
 * Privacy: the payload is a fixed allowlist — kind, a truncated message with
 * URL query strings/fragments removed, the source file path + line/col, the
 * build id, and a coarse browser family. No seeds, full URLs, or identifiers.
 */

import {
  CLIENT_ERROR_MAX_REPORTS,
  buildClientErrorReport,
  uaFamily,
  type ClientErrorKind,
  type ErrorLocation,
  type UaFamily,
} from "../client-error-contract";

export const CLIENT_ERROR_ENDPOINT = "/api/client-error";

export interface ClientErrorTransport {
  sendBeacon?: (url: string, data: Blob) => boolean;
  fetch?: (url: string, init: RequestInit) => Promise<unknown>;
}

export interface ClientErrorReporterOptions {
  build: string;
  ua: UaFamily;
  origin: string;
  transport: ClientErrorTransport;
  maxReports?: number;
}

export interface ClientErrorReporter {
  report: (kind: ClientErrorKind, reason: unknown, location?: ErrorLocation) => boolean;
  readonly sent: () => number;
}

/** Dedupes identical reports and caps sends per page load. Never throws. */
export function createClientErrorReporter(options: ClientErrorReporterOptions): ClientErrorReporter {
  const max = options.maxReports ?? CLIENT_ERROR_MAX_REPORTS;
  const seen = new Set<string>();
  let sent = 0;

  return {
    sent: () => sent,
    report(kind, reason, location) {
      if (sent >= max) return false;
      try {
        const report = buildClientErrorReport(kind, reason, { ...options, location });
        const key = `${report.kind}|${report.message}|${report.source ?? ""}|${report.line ?? ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        sent++;

        const body = JSON.stringify(report);
        const { sendBeacon, fetch } = options.transport;
        const beaconed = sendBeacon?.(CLIENT_ERROR_ENDPOINT, new Blob([body], { type: "application/json" }));
        if (!beaconed && fetch) {
          void fetch(CLIENT_ERROR_ENDPOINT, {
            method: "POST",
            body,
            headers: { "content-type": "application/json" },
            keepalive: true,
          }).catch(() => undefined);
        }
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Hashed chunk name of the bundle this module lives in, e.g. `index-61FAqeWf`. */
export function buildIdFromModuleUrl(moduleUrl: string): string {
  try {
    const file = new URL(moduleUrl).pathname.split("/").pop() ?? "";
    const id = file.replace(/\.[a-z]+$/i, "").replace(/[^\w.-]/g, "").slice(0, 64);
    return id || "unknown";
  } catch {
    return "unknown";
  }
}

let activeReporter: ClientErrorReporter | null = null;

/** Report a handled failure. A no-op until `installClientErrorReporting` runs. */
export function reportClientError(kind: ClientErrorKind, reason: unknown): void {
  activeReporter?.report(kind, reason);
}

/** Wires `window` `error` / `unhandledrejection` and enables `reportClientError`. */
export function installClientErrorReporting(win: Window = window): () => void {
  const reporter = createClientErrorReporter({
    build: buildIdFromModuleUrl(import.meta.url),
    ua: uaFamily(win.navigator.userAgent),
    origin: win.location.origin,
    transport: {
      sendBeacon: win.navigator.sendBeacon ? (url, data) => win.navigator.sendBeacon(url, data) : undefined,
      fetch: win.fetch ? (url, init) => win.fetch(url, init) : undefined,
    },
  });
  activeReporter = reporter;

  const onError = (event: ErrorEvent): void => {
    reporter.report("error", event.error ?? event.message, {
      source: event.filename,
      line: event.lineno,
      col: event.colno,
    });
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    reporter.report("unhandledrejection", event.reason);
  };

  win.addEventListener("error", onError);
  win.addEventListener("unhandledrejection", onRejection);
  return () => {
    win.removeEventListener("error", onError);
    win.removeEventListener("unhandledrejection", onRejection);
    if (activeReporter === reporter) activeReporter = null;
  };
}
