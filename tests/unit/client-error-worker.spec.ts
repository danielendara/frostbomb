import { describe, expect, it, vi } from "vitest";
import { CLIENT_ERROR_BODY_MAX, handleClientError, parseClientErrorReport } from "../../src/worker/client-error";
import worker from "../../src/worker/index";

const url = "https://frostbomb.com/api/client-error";
const valid = {
  kind: "error",
  message: "boom",
  source: "/assets/index-abc.js",
  line: 1,
  col: 2,
  build: "index-abc",
  ua: "chrome",
};

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "POST", body, headers: { "content-type": "application/json", ...headers } });
}

describe("POST /api/client-error", () => {
  it("logs one structured line and returns 204 for a valid report", async () => {
    const log = vi.fn();
    const res = await handleClientError(post(JSON.stringify(valid)), log);

    expect(res.status).toBe(204);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0]![0])).toEqual({ event: "client_error", ...valid });
  });

  it("returns 413 for an oversized body, by header or by bytes", async () => {
    const log = vi.fn();
    const big = JSON.stringify({ ...valid, message: "x".repeat(CLIENT_ERROR_BODY_MAX) });

    expect((await handleClientError(post(big), log)).status).toBe(413);
    expect((await handleClientError(post("{}", { "content-length": "5000" }), log)).status).toBe(413);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(CLIENT_ERROR_BODY_MAX + 1)));
        controller.close();
      },
    });
    const streamed = new Request(url, { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect((await handleClientError(streamed, log)).status).toBe(413);
    expect(log).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["an array", "[]"],
    ["an unknown kind", JSON.stringify({ ...valid, kind: "nope" })],
    ["an extra field", JSON.stringify({ ...valid, seed: "abc" })],
    ["a long message", JSON.stringify({ ...valid, message: "x".repeat(301) })],
    ["a source with a query", JSON.stringify({ ...valid, source: "/assets/a.js?seed=1" })],
    ["a full URL source", JSON.stringify({ ...valid, source: "https://frostbomb.com/assets/a.js" })],
    ["a bad build id", JSON.stringify({ ...valid, build: "has space" })],
    ["an unknown UA family", JSON.stringify({ ...valid, ua: "Mozilla/5.0" })],
    ["a negative line", JSON.stringify({ ...valid, line: -1 })],
  ])("returns 400 for %s", async (_label, body) => {
    const log = vi.fn();
    expect((await handleClientError(post(body), log)).status).toBe(400);
    expect(log).not.toHaveBeenCalled();
  });

  it("returns 405 for non-POST methods", async () => {
    const res = await handleClientError(new Request(url, { method: "GET" }), vi.fn());
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });

  it("accepts minimal reports without source/line/col", () => {
    expect(parseClientErrorReport({ kind: "export", message: "", build: "index-a", ua: "other" })).not.toBeNull();
    expect(parseClientErrorReport({ ...valid, source: "external" })).not.toBeNull();
  });

  it("accepts the webgl-unavailable kind", () => {
    expect(
      parseClientErrorReport({ ...valid, kind: "webgl-unavailable", message: "WebGL2 unavailable" }),
    ).not.toBeNull();
  });

  it("routes only /api/client-error in the Worker entry", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await worker.fetch(post(JSON.stringify(valid)))).status).toBe(204);
    expect((await worker.fetch(new Request("https://frostbomb.com/api/other"))).status).toBe(404);
    errorSpy.mockRestore();
  });
});
