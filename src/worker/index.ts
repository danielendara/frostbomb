import { handleClientError } from "./client-error";

// Minimal Worker entry (#356). `assets.run_worker_first` routes only `/api/*`
// here; every other request is served straight from static assets (SPA
// fallback, `_headers`, caching) exactly as before.
export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/client-error") return handleClientError(request);
    return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  },
};
