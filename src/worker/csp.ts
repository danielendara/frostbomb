/** Canonical CSP directives; kept in sync with `Content-Security-Policy` under `/*` in `public/_headers`. */
export const CSP_DIRECTIVES: Record<string, readonly string[]> = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "https://static.cloudflareinsights.com"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "font-src": ["'self'"],
  "img-src": ["'self'", "data:", "blob:"],
  "connect-src": ["'self'", "https://cloudflareinsights.com"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'none'"],
  "frame-ancestors": ["'none'"],
};

export type CspDirectiveMap = Record<string, readonly string[]>;

export function serializeCsp(directives: CspDirectiveMap, options?: { nonce?: string }): string {
  return Object.entries(directives)
    .map(([name, sources]) => {
      const values = [...sources];
      if (name === "script-src" && options?.nonce) {
        values.unshift(`'nonce-${options.nonce}'`);
      }
      return `${name} ${values.join(" ")}`;
    })
    .join("; ");
}

/** Parse a `Content-Security-Policy` header value into a directive map. */
export function parseContentSecurityPolicy(header: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const space = trimmed.indexOf(" ");
    if (space === -1) {
      directives[trimmed] = [];
      continue;
    }
    const name = trimmed.slice(0, space);
    directives[name] = trimmed.slice(space + 1).trim().split(/\s+/).filter(Boolean);
  }
  return directives;
}

export function createCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function isHtmlDocument(response: Response): boolean {
  const type = response.headers.get("content-type") ?? "";
  return type.includes("text/html");
}

export function applyHtmlContentSecurityPolicy(response: Response, nonce: string): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", serializeCsp(CSP_DIRECTIVES, { nonce }));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function withHtmlCspIfNeeded(response: Response): Response {
  if (!isHtmlDocument(response)) return response;
  return applyHtmlContentSecurityPolicy(response, createCspNonce());
}
