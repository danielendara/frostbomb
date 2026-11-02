import { afterEach, describe, expect, it, vi } from 'vitest';
import { initNakayaDiagram } from '../../src/snowflake/diagram.ts';

type Call = [string, unknown[]];

function fakeCanvas(width: number, height: number) {
  const calls: Call[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, prop: string) => {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push([prop, args]);
      };
    },
    set: (target, prop: string, value) => {
      target[prop] = value;
      return true;
    },
  });
  return { width, height, calls, getContext: () => ctx } as unknown as HTMLCanvasElement & {
    calls: Call[];
  };
}

describe('initNakayaDiagram HiDPI', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scales the backing store by devicePixelRatio and redraws the visible canvas when fonts are ready', async () => {
    const cache = fakeCanvas(0, 0);
    let resolveFonts!: () => void;
    const ready = new Promise<void>((r) => {
      resolveFonts = r;
    });
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    vi.stubGlobal('document', { createElement: () => cache, fonts: { ready } });

    const canvas = fakeCanvas(300, 200);
    const diagram = initNakayaDiagram(canvas)!;

    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(400);
    expect(cache.width).toBe(600);
    expect(cache.height).toBe(400);
    expect(canvas.calls).toContainEqual(['setTransform', [2, 0, 0, 2, 0, 0]]);
    expect(cache.calls).toContainEqual(['setTransform', [2, 0, 0, 2, 0, 0]]);

    diagram.update([{ temp: -15, ss: 0.5 }]);
    const blits = () => canvas.calls.filter(([n]) => n === 'drawImage').length;
    expect(blits()).toBe(1);
    expect(canvas.calls.find(([n]) => n === 'drawImage')![1]).toEqual([cache, 0, 0, 300, 200]);

    resolveFonts();
    await ready;
    await Promise.resolve();
    expect(blits()).toBe(2);
  });

  it('defers morphology background work until ensureBackground is called', () => {
    const cache = fakeCanvas(0, 0);
    vi.stubGlobal('document', { createElement: () => cache, fonts: undefined });
    vi.stubGlobal('window', { devicePixelRatio: 1 });

    const canvas = fakeCanvas(300, 200);
    const diagram = initNakayaDiagram(canvas, { deferBackground: true })!;
    expect(diagram.hasBackground()).toBe(false);
    expect(cache.calls.filter(([name]) => name === 'fillRect').length).toBe(0);

    diagram.ensureBackground();
    expect(diagram.hasBackground()).toBe(true);
    expect(cache.calls.some(([name]) => name === 'fillRect')).toBe(true);
  });

  it('does not bake deferred background on document.fonts.ready before ensureBackground', async () => {
    const cache = fakeCanvas(0, 0);
    let resolveFonts!: () => void;
    const ready = new Promise<void>((r) => {
      resolveFonts = r;
    });
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('document', { createElement: () => cache, fonts: { ready } });

    const canvas = fakeCanvas(300, 200);
    const diagram = initNakayaDiagram(canvas, { deferBackground: true })!;
    const fillRects = () => cache.calls.filter(([name]) => name === 'fillRect').length;

    expect(diagram.hasBackground()).toBe(false);
    expect(fillRects()).toBe(0);

    resolveFonts();
    await ready;
    await Promise.resolve();

    expect(diagram.hasBackground()).toBe(false);
    expect(fillRects()).toBe(0);

    diagram.ensureBackground();
    expect(diagram.hasBackground()).toBe(true);
    const baked = fillRects();
    expect(baked).toBeGreaterThan(0);

    diagram.ensureBackground();
    expect(fillRects()).toBe(baked);
  });

  it('caps the scale at 3 and defaults to 1', () => {
    vi.stubGlobal('document', { createElement: () => fakeCanvas(0, 0) });

    vi.stubGlobal('window', { devicePixelRatio: 5 });
    const hi = fakeCanvas(300, 200);
    initNakayaDiagram(hi);
    expect([hi.width, hi.height]).toEqual([900, 600]);

    vi.stubGlobal('window', {});
    const lo = fakeCanvas(300, 200);
    initNakayaDiagram(lo);
    expect([lo.width, lo.height]).toEqual([300, 200]);
  });
});
