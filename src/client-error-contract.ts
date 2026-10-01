/**
 * Shared client-error payload contract (#356). Browser and Worker both use
 * these constants, types, and pure helpers; transport and DOM wiring live in
 * `src/ui/client-error.ts`, validation of inbound POST bodies in
 * `src/worker/client-error.ts`.
 */

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
