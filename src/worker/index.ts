import { handleClientError } from "./client-error";
import { withHtmlCspIfNeeded } from "./csp";

// Keep in sync with `Strict-Transport-Security` in public/_headers.
// Deliberately no includeSubDomains/preload (hard to undo).
const HSTS = "max-age=86400";

function withHsts(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set("strict-transport-security", HSTS);
  return out;
}

type Env = {
  ASSETS: { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
};

// Worker runs first for all requests (`assets.run_worker_first`). `/api/*` is handled
// here; everything else is proxied to static assets (SPA fallback, `_headers`, caching)
// with a strict, nonce-bearing CSP on HTML responses for Cloudflare JS detections.
export default {
  async fetch(request: Request, env?: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/client-error") return withHsts(await handleClientError(request));
    if (pathname.startsWith("/api/")) {
      return withHsts(new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } }));
    }

    if (!env?.ASSETS) {
      return withHsts(new Response("Asset binding missing", { status: 500, headers: { "cache-control": "no-store" } }));
    }

    const asset = await env.ASSETS.fetch(request);
    return withHsts(withHtmlCspIfNeeded(request, asset));
  },
};