import {
  CLIENT_ERROR_KINDS,
  CLIENT_ERROR_MESSAGE_MAX,
  CLIENT_ERROR_SOURCE_MAX,
  UA_FAMILIES,
  type ClientErrorReport,
} from "../client-error-contract";

/** Largest accepted report body, in bytes (#356). */
export const CLIENT_ERROR_BODY_MAX = 2048;

const REPORT_KEYS = new Set(["kind", "message", "source", "line", "col", "build", "ua"]);
const kinds = new Set<string>(CLIENT_ERROR_KINDS);
const uaFamilies = new Set<string>(UA_FAMILIES);

function empty(status: number): Response {
  return new Response(null, { status, headers: { "cache-control": "no-store" } });
}

/** Reads at most `limit + 1` bytes so an oversized body is never buffered whole. */
async function readCapped(request: Request, limit: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

const isPosition = (value: unknown) =>
  value === undefined || (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10_000_000);

/** Exact allowlisted shape, or `null`. Unknown keys are rejected, not dropped. */
export function parseClientErrorReport(value: unknown): ClientErrorReport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const report = value as Record<string, unknown>;
  if (Object.keys(report).some((key) => !REPORT_KEYS.has(key))) return null;

  const { kind, message, source, line, col, build, ua } = report;
  if (typeof kind !== "string" || !kinds.has(kind)) return null;
  if (typeof message !== "string" || message.length > CLIENT_ERROR_MESSAGE_MAX) return null;
  if (typeof build !== "string" || !/^[\w.-]{1,64}$/.test(build)) return null;
  if (typeof ua !== "string" || !uaFamilies.has(ua)) return null;
  if (
    source !== undefined &&
    (typeof source !== "string" ||
      source.length > CLIENT_ERROR_SOURCE_MAX ||
      !(source === "external" || /^\/[^?#\s]*$/.test(source)))
  ) {
    return null;
  }
  if (!isPosition(line) || !isPosition(col)) return null;

  return report as unknown as ClientErrorReport;
}

/**
 * `POST /api/client-error`: validates one browser report and writes it as a
 * single structured `console.error` line, which Workers Logs indexes.
 */
export async function handleClientError(
  request: Request,
  log: (line: string) => void = (line) => console.error(line),
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > CLIENT_ERROR_BODY_MAX) return empty(413);

  const bytes = await readCapped(request, CLIENT_ERROR_BODY_MAX);
  if (!bytes) return empty(413);

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return empty(400);
  }

  const report = parseClientErrorReport(parsed);
  if (!report) return empty(400);

  log(JSON.stringify({ event: "client_error", ...report }));
  return empty(204);
}
