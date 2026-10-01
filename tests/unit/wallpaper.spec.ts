import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  MAX_WALLPAPER_EDGE,
  captureWallpaper,
  wallpaperFileName,
  wallpaperSize,
  type WallpaperScene,
} from "../../src/ui/wallpaper";

const base = { screenW: 390, screenH: 844, dpr: 3, orientation: "portrait" as const, maxTexture: 16384 };

describe("wallpaperSize", () => {
  it("390×844 @3 portrait → 1170×2532", () => {
    expect(wallpaperSize(base)).toEqual({ width: 1170, height: 2532 });
  });

  it("swaps for landscape, whichever order the screen reports", () => {
    const landscape = { width: 2532, height: 1170 };
    expect(wallpaperSize({ ...base, orientation: "landscape" })).toEqual(landscape);
    expect(wallpaperSize({ ...base, screenW: 844, screenH: 390, orientation: "landscape" })).toEqual(landscape);
    // A landscape-reporting screen still comes out portrait when held portrait.
    expect(wallpaperSize({ ...base, screenW: 844, screenH: 390, orientation: "portrait" })).toEqual({
      width: 1170,
      height: 2532,
    });
  });

  it("caps the pixel ratio at 3", () => {
    expect(wallpaperSize({ ...base, dpr: 4 })).toEqual(wallpaperSize({ ...base, dpr: 3 }));
    expect(wallpaperSize({ ...base, dpr: 2 })).toEqual({ width: 780, height: 1688 });
  });

  it("falls back to 1× for a missing or invalid dpr", () => {
    expect(wallpaperSize({ ...base, dpr: 0 })).toEqual({ width: 390, height: 844 });
    expect(wallpaperSize({ ...base, dpr: Number.NaN })).toEqual({ width: 390, height: 844 });
  });

  it("clamps the long edge to 4096 and keeps the aspect", () => {
    const { width, height } = wallpaperSize({ ...base, screenW: 1440, screenH: 3200, maxTexture: 16384 });
    expect(height).toBe(MAX_WALLPAPER_EDGE);
    expect(width).toBe(Math.round((1440 * 3 * 4096) / (3200 * 3)));
    expect(width / height).toBeCloseTo(1440 / 3200, 3);
  });

  it("clamps to maxTexture when it is below 4096", () => {
    const { width, height } = wallpaperSize({ ...base, maxTexture: 2048 });
    expect(height).toBe(2048);
    expect(width).toBe(Math.round((1170 * 2048) / 2532));
  });

  it("never exceeds 4096 even when the GPU allows more", () => {
    const size = wallpaperSize({ ...base, screenW: 2560, screenH: 1440, orientation: "landscape", maxTexture: 32768 });
    expect(Math.max(size.width, size.height)).toBe(4096);
  });

  it("rounds odd sizes to whole pixels (never 0)", () => {
    const odd = wallpaperSize({ screenW: 391, screenH: 845, dpr: 2.625, orientation: "portrait", maxTexture: 16384 });
    expect(Number.isInteger(odd.width) && Number.isInteger(odd.height)).toBe(true);
    expect(odd).toEqual({ width: Math.round(391 * 2.625), height: Math.round(845 * 2.625) });
    expect(wallpaperSize({ screenW: 0, screenH: 0, dpr: 1, orientation: "portrait", maxTexture: 0 })).toEqual({
      width: 1,
      height: 1,
    });
  });
});

describe("wallpaperFileName", () => {
  it("puts -wallpaper before the extension of the export file name", () => {
    expect(wallpaperFileName({ habit: "fernlike_dendrite", seed: "abcde" })).toBe(
      "frostbomb-fernlike-dendrite-abcde-wallpaper.png",
    );
  });
});

/** A fake scene that mimics the real one: `resize()` is updateCamera, re-fitting to the window. */
function makeFakeScene(opts: { renderThrows?: boolean } = {}) {
  const WINDOW = { w: 390, h: 844, pixelRatio: 2 };
  const state = {
    pixelRatio: WINDOW.pixelRatio,
    size: [WINDOW.w, WINDOW.h] as number[],
    updateStyle: true,
    aspect: WINDOW.w / WINDOW.h,
    z: 10 / (WINDOW.w / WINDOW.h),
    composer: [WINDOW.w, WINDOW.h] as number[],
  };
  const pre = JSON.parse(JSON.stringify(state)) as typeof state;
  const atRender: { snapshot?: typeof state } = {};
  const calls: string[] = [];

  const domElement = { id: "webgl" } as unknown as HTMLCanvasElement;
  const scene: WallpaperScene = {
    renderer: {
      domElement,
      setPixelRatio: (r) => {
        calls.push(`pixelRatio:${r}`);
        state.pixelRatio = r;
      },
      setSize: (w, h, updateStyle) => {
        calls.push(`size:${w}x${h}:${updateStyle}`);
        state.size = [w, h];
        state.updateStyle = updateStyle ?? true;
      },
    },
    camera: {
      get aspect() {
        return state.aspect;
      },
      set aspect(v: number) {
        state.aspect = v;
      },
      position: {
        get z() {
          return state.z;
        },
        set z(v: number) {
          state.z = v;
        },
      },
      updateProjectionMatrix: () => calls.push("projection"),
    },
    composer: {
      setSize: (w, h) => {
        calls.push(`composer:${w}x${h}`);
        state.composer = [w, h];
      },
      render: () => {
        calls.push("render");
        atRender.snapshot = JSON.parse(JSON.stringify(state));
        if (opts.renderThrows) throw new Error("context lost");
      },
    },
    resize: () => {
      calls.push("resize");
      state.pixelRatio = WINDOW.pixelRatio;
      state.size = [WINDOW.w, WINDOW.h];
      state.updateStyle = true;
      state.aspect = WINDOW.w / WINDOW.h;
      state.z = 10 / (WINDOW.w / WINDOW.h);
      state.composer = [WINDOW.w, WINDOW.h];
    },
  };
  return { scene, state, pre, atRender, calls, domElement };
}

function fakeCanvasFactory() {
  const draws: string[] = [];
  const ctx = {
    fillStyle: "",
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => draws.push(`fill:${ctx.fillStyle}:${x},${y},${w},${h}`)),
    drawImage: vi.fn((_src: unknown, x: number, y: number) => draws.push(`draw:${x},${y}`)),
  };
  const out = { width: 0, height: 0, getContext: vi.fn(() => ctx) } as unknown as HTMLCanvasElement;
  return { out, ctx, draws, create: () => out };
}

describe("captureWallpaper", () => {
  const size = { width: 1170, height: 2532 };

  it("renders at the target size, composites onto the opaque fill, then restores", () => {
    const fake = makeFakeScene();
    const canvas = fakeCanvasFactory();

    const result = captureWallpaper(fake.scene, size, "rgb(5, 9, 18)", canvas.create);

    expect(result).toBe(canvas.out);
    // The temporary state while rendering: pixel ratio 1, exact size, canvas CSS untouched, portrait framing.
    expect(fake.atRender.snapshot).toMatchObject({
      pixelRatio: 1,
      size: [1170, 2532],
      updateStyle: false,
      composer: [1170, 2532],
    });
    expect(fake.atRender.snapshot!.aspect).toBeCloseTo(1170 / 2532, 6);
    expect(fake.atRender.snapshot!.z).toBeCloseTo(10 / (1170 / 2532), 6);
    // Solid fill first, then the WebGL canvas on top.
    expect(canvas.out.width).toBe(1170);
    expect(canvas.out.height).toBe(2532);
    expect(canvas.draws).toEqual(["fill:rgb(5, 9, 18):0,0,1170,2532", "draw:0,0"]);
    expect(canvas.ctx.drawImage).toHaveBeenCalledWith(fake.domElement, 0, 0);
    // Everything restored, resize last.
    expect(fake.state).toEqual(fake.pre);
    expect(fake.calls.at(-1)).toBe("resize");
    expect(fake.calls.indexOf("render")).toBeLessThan(fake.calls.indexOf("resize"));
  });

  it("uses z = 10 for landscape targets (aspect ≥ 1)", () => {
    const fake = makeFakeScene();
    captureWallpaper(fake.scene, { width: 2532, height: 1170 }, "#000", fakeCanvasFactory().create);
    expect(fake.atRender.snapshot!.z).toBe(10);
    expect(fake.state).toEqual(fake.pre);
  });

  it("restores the pre-capture values even when render throws", () => {
    const fake = makeFakeScene({ renderThrows: true });
    expect(() => captureWallpaper(fake.scene, size, "#000", fakeCanvasFactory().create)).toThrow("context lost");
    expect(fake.calls.filter((c) => c === "resize")).toHaveLength(1);
    expect(fake.state).toEqual(fake.pre);
  });

  it("restores when the 2D context is unavailable", () => {
    const fake = makeFakeScene();
    const noCtx = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() => captureWallpaper(fake.scene, size, "#000", () => noCtx)).toThrow("2D canvas unavailable");
    expect(fake.state).toEqual(fake.pre);
  });
});

describe("index.html wiring", () => {
  const html = readFileSync("index.html", "utf8");

  it("has a Save as wallpaper button with the W shortcut", () => {
    expect(html).toMatch(/id="btn-save-wallpaper"[^>]*title="Save as wallpaper \(W\)"[^>]*aria-label="Save as wallpaper \(W\)"[^>]*aria-keyshortcuts="w"/);
  });

  it("documents W in the #guide-shortcuts list", () => {
    const section = html.match(/<section id="guide-shortcuts"[\s\S]*?<\/section>/)![0];
    expect(section).toContain('<dl class="shortcuts-list">');
    expect(section).toMatch(/<kbd>W<\/kbd><\/dt><dd>[^<]*wallpaper/i);
  });
});
