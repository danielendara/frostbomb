/**
 * Browser error reporting (#356). Sends one small, allowlisted report per
 * event to `POST /api/client-error`, which the Worker writes to Workers Logs.
 *
 * Privacy: the payload is a fixed allowlist — kind, a truncated message with
 * URL query strings/fragments removed, the source file path + line/col, the
 * build id, and a coarse browser family. No seeds, full URLs, or identifiers.
 */

export const CLIENT_ERROR_ENDPOINT = "/api/client-error";
export const CLIENT_ERROR_MAX_REPORTS = 5;
export const CLIENT_ERROR_MESSAGE_MAX = 300;
export const CLIENT_ERROR_SOURCE_MAX = 200;

export const CLIENT_ERROR_KINDS = [
  "error",
  "unhandledrejection",
  "webgl-context-lost",
  "frost-worker",
  "chunk-reload",
  "chunk-load",
  "postprocessing",
  "export",
] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

export const UA_FAMILIES = ["chrome", "edge", "firefox", "safari", "other"] as const;
export type UaFamily = (typeof UA_FAMILIES)[number];

export interface ClientErrorReport {
  kind: ClientErrorKind;
  message: string;
  source?: string;
  line?: number;
  col?: number;
  build: string;
  ua: UaFamily;
}

export interface ErrorLocation {
  source?: string;
  line?: number;
  col?: number;
}

/** Drops `?query` and `#fragment` from anything URL-shaped in free text. */
export function stripUrlParams(text: string): string {
  return text.replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#'"()]*|\/[^\s?#'"()]*)[?#][^\s'"()]*/gi, "$1");
}

/** Same-origin script path only (`/assets/index-abc.js`); anything else is `external`. */
export function sanitizeSource(raw: string | undefined, origin: string): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, origin);
    const path = url.origin === origin ? url.pathname : "external";
    return path.slice(0, CLIENT_ERROR_SOURCE_MAX);
  } catch {
    return undefined;
  }
}

export function uaFamily(userAgent: string): UaFamily {
  if (/Edg\//.test(userAgent)) return "edge";
  if (/Firefox\//.test(userAgent)) return "firefox";
  if (/Chrome\/|CriOS\//.test(userAgent)) return "chrome";
  if (/Safari\//.test(userAgent)) return "safari";
  return "other";
}

function messageOf(reason: unknown): string {
  if (reason instanceof Error) return reason.message || reason.name;
  if (typeof reason === "string") return reason;
  if (reason && typeof reason === "object" && "message" in reason) {
    const message = (reason as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Unknown error";
}

/** First `file:line:col` in a stack trace (V8, Firefox and Safari formats). */
export function locationFromStack(stack: string | undefined): ErrorLocation {
  const match = stack?.match(/((?:https?:\/\/|\/)[^\s()@]+):(\d+):(\d+)/);
  if (!match) return {};
  return { source: match[1], line: Number(match[2]), col: Number(match[3]) };
}

function nonNegativeInt(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function buildClientErrorReport(
  kind: ClientErrorKind,
  reason: unknown,
  context: { build: string; ua: UaFamily; origin: string; location?: ErrorLocation },
): ClientErrorReport {
  const location =
    context.location ?? locationFromStack(reason instanceof Error ? reason.stack : undefined);
  const report: ClientErrorReport = {
    kind,
    message: stripUrlParams(messageOf(reason)).slice(0, CLIENT_ERROR_MESSAGE_MAX),
    build: context.build,
    ua: context.ua,
  };
  const source = sanitizeSource(location.source, context.origin);
  if (source) report.source = source;
  const line = nonNegativeInt(location.line);
  const col = nonNegativeInt(location.col);
  if (source && line !== undefined) report.line = line;
  if (source && col !== undefined) report.col = col;
  return report;
}

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
