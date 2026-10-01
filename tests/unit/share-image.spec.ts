import { describe, expect, it, vi } from "vitest";
import {
  canShareFiles,
  drawOnOpaqueCanvas,
  shareSnowflake,
  type ShareNavigator,
} from "../../src/ui/share-image";

function fakeCanvas(blob: Blob | null = new Blob(["png"], { type: "image/png" })) {
  return {
    toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(blob)),
  } as unknown as HTMLCanvasElement;
}

const base = {
  fileName: "frostbomb-needle-abcde.png",
  title: "Frostbomb snowflake abcde",
  text: "Needle · seed abcde",
  url: "https://frostbomb.example/?seed=abcde",
};

describe("canShareFiles", () => {
  it("is false without a navigator or without share / canShare", () => {
    expect(canShareFiles(undefined)).toBe(false);
    expect(canShareFiles({})).toBe(false);
    expect(canShareFiles({ share: vi.fn() })).toBe(false);
    expect(canShareFiles({ canShare: vi.fn(() => true) })).toBe(false);
  });

  it("is false when canShare rejects files or throws", () => {
    expect(canShareFiles({ share: vi.fn(), canShare: vi.fn(() => false) })).toBe(false);
    expect(
      canShareFiles({
        share: vi.fn(),
        canShare: vi.fn(() => {
          throw new TypeError("nope");
        }),
      }),
    ).toBe(false);
  });

  it("is true when canShare accepts a PNG file, and probes with one", () => {
    const canShare = vi.fn(() => true);
    expect(canShareFiles({ share: vi.fn(), canShare })).toBe(true);
    const arg = canShare.mock.calls[0][0] as ShareData;
    expect(arg.files).toHaveLength(1);
    expect(arg.files![0].type).toBe("image/png");
  });
});

describe("shareSnowflake", () => {
  it("shares one PNG file with the expected name, title, text and url", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const outcome = await shareSnowflake({ ...base, canvas: fakeCanvas(), nav: { share }, onError });

    expect(outcome).toBe("shared");
    expect(onError).not.toHaveBeenCalled();
    expect(share).toHaveBeenCalledTimes(1);
    const data = share.mock.calls[0][0] as ShareData;
    expect(data.files).toHaveLength(1);
    expect(data.files![0].name).toBe(base.fileName);
    expect(data.files![0].type).toBe("image/png");
    expect(data.title).toBe(base.title);
    expect(data.text).toBe(base.text);
    expect(data.url).toBe(base.url);
  });

  it("is 'cancelled' for AbortError and never reports it", async () => {
    const onError = vi.fn();
    const abort = Object.assign(new Error("Share canceled"), { name: "AbortError" });
    const nav: ShareNavigator = { share: vi.fn().mockRejectedValue(abort) };
    expect(await shareSnowflake({ ...base, canvas: fakeCanvas(), nav, onError })).toBe("cancelled");
    expect(onError).not.toHaveBeenCalled();
  });

  it("treats a DOMException AbortError as cancelled too", async () => {
    const onError = vi.fn();
    const nav: ShareNavigator = {
      share: vi.fn().mockRejectedValue(new DOMException("dismissed", "AbortError")),
    };
    expect(await shareSnowflake({ ...base, canvas: fakeCanvas(), nav, onError })).toBe("cancelled");
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports 'failed' (not 'cancelled') for NotAllowedError, reporting once", async () => {
    const onError = vi.fn();
    const err = new DOMException("needs a user gesture", "NotAllowedError");
    const nav: ShareNavigator = { share: vi.fn().mockRejectedValue(err) };
    expect(await shareSnowflake({ ...base, canvas: fakeCanvas(), nav, onError })).toBe("failed");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(err);
  });

  it("reports 'failed' for any other error", async () => {
    const onError = vi.fn();
    const nav: ShareNavigator = { share: vi.fn().mockRejectedValue(new Error("boom")) };
    expect(await shareSnowflake({ ...base, canvas: fakeCanvas(), nav, onError })).toBe("failed");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("is 'failed' when the canvas cannot be encoded, without calling share", async () => {
    const onError = vi.fn();
    const share = vi.fn();
    expect(await shareSnowflake({ ...base, canvas: fakeCanvas(null), nav: { share }, onError })).toBe(
      "failed",
    );
    expect(share).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("awaits nothing but toBlob before calling share (keeps the user gesture)", async () => {
    const order: string[] = [];
    const canvas = {
      toBlob: (cb: (b: Blob | null) => void) => {
        order.push("toBlob");
        cb(new Blob(["png"], { type: "image/png" }));
      },
    } as unknown as HTMLCanvasElement;
    const share = vi.fn(async () => {
      order.push("share");
    });
    const pending = shareSnowflake({ ...base, canvas, nav: { share } });
    // toBlob has already run synchronously inside the call.
    expect(order).toEqual(["toBlob"]);
    await pending;
    expect(order).toEqual(["toBlob", "share"]);
  });
});

describe("drawOnOpaqueCanvas", () => {
  it("fills the offscreen canvas with the backdrop colour, then draws the source on top", () => {
    const calls: string[] = [];
    const ctx = {
      fillStyle: "",
      fillRect: vi.fn(() => calls.push(`fill:${ctx.fillStyle}`)),
      drawImage: vi.fn(() => calls.push("draw")),
    };
    const out = { width: 0, height: 0, getContext: vi.fn(() => ctx) } as unknown as HTMLCanvasElement;
    const source = { width: 640, height: 480 } as HTMLCanvasElement;

    const result = drawOnOpaqueCanvas(source, "rgb(5, 9, 18)", () => out);

    expect(result).toBe(out);
    expect(out.width).toBe(640);
    expect(out.height).toBe(480);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 640, 480);
    expect(calls).toEqual(["fill:rgb(5, 9, 18)", "draw"]);
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 0, 0);
  });

  it("throws when a 2D context is unavailable", () => {
    const out = { getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() => drawOnOpaqueCanvas({ width: 1, height: 1 } as HTMLCanvasElement, "#000", () => out)).toThrow();
  });
});
