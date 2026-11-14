/** Non‑Cloudflare `script-src` for static responses (`public/_headers`). HTML documents get a per-request nonce via the Worker. */
export const STATIC_SCRIPT_SRC = "'self' https://static.cloudflareinsights.com";

/** Matches `Content-Security-Policy` under `/*` in `public/_headers` (no per-request nonce). */
export function staticContentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    `script-src ${STATIC_SCRIPT_SRC}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://cloudflareinsights.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** CSP for HTML documents: Cloudflare JS detections pick up `nonce-…` from this response header. */
export function htmlContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://static.cloudflareinsights.com`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://cloudflareinsights.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function createCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function applyHtmlContentSecurityPolicy(response: Response, nonce: string): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", htmlContentSecurityPolicy(nonce));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isHtmlDocument(request: Request, response: Response): boolean {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("text/html")) return true;
  const accept = request.headers.get("Accept") ?? "";
  return response.ok && accept.includes("text/html");
}

export function withHtmlCspIfNeeded(request: Request, response: Response): Response {
  if (!isHtmlDocument(request, response)) return response;
  return applyHtmlContentSecurityPolicy(response, createCspNonce());
}