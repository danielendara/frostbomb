import { handleClientError } from "./client-error";

// Keep in sync with `Strict-Transport-Security` in public/_headers.
// Deliberately no includeSubDomains/preload (hard to undo).
const HSTS = "max-age=86400";

function withHsts(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set("strict-transport-security", HSTS);
  return out;
}

// Minimal Worker entry. `assets.run_worker_first` routes only `/api/*`
// here; every other request is served straight from static assets (SPA
// fallback, `_headers`, caching) exactly as before.
export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/client-error") return withHsts(await handleClientError(request));
    return withHsts(new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } }));
  },
};
