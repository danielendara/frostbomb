/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announce } from '../../src/ui/announcer';
import { SeedHistoryManager, STORAGE_KEY } from '../../src/ui/history';

vi.mock('../../src/ui/announcer', () => ({
  announce: vi.fn(),
}));

vi.mock('../../src/ui/feedback', () => ({
  visualPress: vi.fn(),
}));

const SEEDS = ['alpha', 'bravo', 'charlie'] as const;
const CURRENT = SEEDS[0];

function mountHistoryDom(): void {
  document.body.innerHTML = `
    <button id="guide-toggle">Guide</button>
    <div id="recent-seeds-container">
      <button id="btn-clear-history">Clear</button>
      <div id="recent-seeds-list"></div>
    </div>
  `;
}

function createManager(seeds: readonly string[] = SEEDS): SeedHistoryManager {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
  const manager = new SeedHistoryManager({ onSelectSeed: vi.fn() });
  manager.updateUI(CURRENT, false, false);
  return manager;
}

function undoButton(): HTMLElement | null {
  return document.getElementById('btn-undo-history');
}

describe('SeedHistoryManager clear/undo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    localStorage.clear();
    mountHistoryDom();
    vi.mocked(announce).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('clear arms undo, backs up seeds, announces, and focuses undo', () => {
    const manager = createManager();
    const container = document.getElementById('recent-seeds-container');
    const clearBtn = document.getElementById('btn-clear-history') as HTMLButtonElement;

    manager.clear(CURRENT, false, false);

    expect(manager.getSeeds()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(announce).toHaveBeenCalledWith(
      'Recent seeds history cleared. You can undo this action.',
    );

    const undoBtn = undoButton();
    expect(undoBtn).not.toBeNull();
    expect(undoBtn).toHaveProperty('textContent', 'undo');
    expect(undoBtn?.classList.contains('undo-armed')).toBe(true);
    expect(container?.classList.contains('undo-armed')).toBe(true);
    expect(container?.style.display).toBe('flex');
    expect(clearBtn.hidden).toBe(true);
    expect(clearBtn.disabled).toBe(true);
    expect(document.activeElement?.id).toBe('btn-undo-history');
  });

  it('undo restores seeds, storage, and focuses clear', () => {
    const manager = createManager();

    manager.clear(CURRENT, false, false);
    manager.undoClear(CURRENT, false, false);

    expect(manager.getSeeds()).toEqual([...SEEDS]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')).toEqual([...SEEDS]);
    expect(announce).toHaveBeenCalledWith('Recent seeds history restored');
    expect(undoButton()).toBeNull();
    expect(document.getElementById('recent-seeds-container')?.classList.contains('undo-armed')).toBe(
      false,
    );

    const seedButtons = document.querySelectorAll('#recent-seeds-list button');
    expect([...seedButtons].map((btn) => btn.textContent)).toEqual([...SEEDS]);

    const clearBtn = document.getElementById('btn-clear-history') as HTMLButtonElement;
    expect(clearBtn.hidden).toBe(false);
    expect(clearBtn.disabled).toBe(false);

    vi.advanceTimersByTime(50);
    expect(document.activeElement?.id).toBe('btn-clear-history');
  });

  it('expire clears undo backup and disarms chrome', () => {
    const manager = createManager();
    const container = document.getElementById('recent-seeds-container');

    manager.clear(CURRENT, false, false);
    expect(undoButton()).not.toBeNull();
    expect(document.activeElement?.id).toBe('btn-undo-history');

    vi.advanceTimersByTime(10_000);

    expect(manager.getSeeds()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(undoButton()).toBeNull();
    expect(container?.classList.contains('undo-armed')).toBe(false);
    expect(container?.style.display).toBe('none');
    expect(document.activeElement?.id).toBe('guide-toggle');

    manager.undoClear(CURRENT, false, false);
    expect(manager.getSeeds()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')).toEqual([]);
  });

  it('double-clear during the undo window does not wipe the seed backup', () => {
    const manager = createManager();

    manager.clear(CURRENT, false, false);
    expect(undoButton()).not.toBeNull();

    manager.addSeed('delta');
    manager.clear(CURRENT, false, false);

    expect(manager.getSeeds()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(undoButton()).not.toBeNull();
    expect(announce).toHaveBeenCalledTimes(1);

    manager.undoClear(CURRENT, false, false);

    expect(manager.getSeeds()).toEqual([...SEEDS]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')).toEqual([...SEEDS]);
    expect(undoButton()).toBeNull();
  });
});
