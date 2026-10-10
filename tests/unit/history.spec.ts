/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announce } from '../../src/ui/announcer';
import {
  KEPT_CAP,
  RECENT_CAP,
  SeedHistoryManager,
  STORAGE_KEY,
  parseStoredEntries,
  serializeEntries,
  withSeedAdded,
} from '../../src/ui/history';

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

    const seedButtons = document.querySelectorAll('#recent-seeds-list button.seed-pill');
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

const seedsN = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(2, '0')}`);

describe('Recent Seeds cap math', () => {
  it('only unkept seeds count toward the recent cap', () => {
    let entries = parseStoredEntries([{ seed: 'kept1', kept: true }]);
    for (const seed of seedsN('new', 8)) entries = withSeedAdded(entries, seed);

    expect(entries.filter((e) => !e.kept)).toHaveLength(RECENT_CAP);
    expect(entries.filter((e) => e.kept).map((e) => e.seed)).toEqual(['kept1']);
    // Newest unkept seeds survive; the kept one never rolls off.
    expect(entries.map((e) => e.seed)).toEqual(['new07', 'new06', 'new05', 'new04', 'new03', 'kept1']);
  });

  it('re-adding a kept seed moves it to the front and keeps it kept', () => {
    const entries = withSeedAdded(parseStoredEntries(['aaaaa', { seed: 'bbbbb', kept: true }]), 'bbbbb');
    expect(entries).toEqual([
      { seed: 'bbbbb', kept: true },
      { seed: 'aaaaa', kept: false },
    ]);
  });

  it('caps kept seeds at KEPT_CAP when loading', () => {
    const stored = seedsN('keep', KEPT_CAP + 3).map((seed) => ({ seed, kept: true }));
    expect(parseStoredEntries(stored)).toHaveLength(KEPT_CAP);
  });
});

describe('Recent Seeds persistence migration', () => {
  it('loads a legacy plain string array unchanged (all unkept)', () => {
    expect(parseStoredEntries(['alpha', 'bravo'])).toEqual([
      { seed: 'alpha', kept: false },
      { seed: 'bravo', kept: false },
    ]);
  });

  it('drops invalid and duplicate entries using SEED_PATTERN', () => {
    expect(
      parseStoredEntries(['alpha', '<script>', 42, null, { seed: 'bad seed!', kept: true }, { kept: true }, 'alpha', { seed: 'bravo', kept: true }]),
    ).toEqual([
      { seed: 'alpha', kept: false },
      { seed: 'bravo', kept: true },
    ]);
  });

  it('trims a legacy list longer than the cap to the newest five', () => {
    expect(parseStoredEntries(seedsN('old', 7)).map((e) => e.seed)).toEqual(seedsN('old', 5));
  });

  it('treats non-array storage as empty', () => {
    expect(parseStoredEntries({ seed: 'alpha' })).toEqual([]);
    expect(parseStoredEntries('alpha')).toEqual([]);
  });

  it('serializes unkept seeds as plain strings and kept seeds as objects', () => {
    expect(serializeEntries(parseStoredEntries(['alpha', { seed: 'bravo', kept: true }]))).toEqual([
      'alpha',
      { seed: 'bravo', kept: true },
    ]);
  });
});

describe('SeedHistoryManager Keep toggle', () => {
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

  const keepToggle = (seed: string) =>
    document.querySelector<HTMLButtonElement>(`#recent-seeds-list button.seed-keep[data-seed="${seed}"]`);

  it('renders an aria-pressed Keep toggle per pill with a non-color marker', () => {
    createManager();
    const toggle = keepToggle('bravo');
    expect(toggle?.getAttribute('aria-label')).toBe('Keep bravo');
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    expect(toggle?.textContent).toBe('☆');

    toggle?.click();

    const after = keepToggle('bravo');
    expect(after?.getAttribute('aria-pressed')).toBe('true');
    expect(after?.textContent).toBe('★');
    expect(document.activeElement).toBe(after);
    const pill = after?.previousElementSibling as HTMLElement;
    expect(pill.classList.contains('is-kept')).toBe(true);
    expect(pill.getAttribute('aria-label')).toBe('Grow seed bravo (kept)');
    expect(announce).toHaveBeenCalledWith('Kept seed bravo');
  });

  it('toggling Keep does not select or regrow the seed', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEEDS));
    const onSelectSeed = vi.fn();
    const manager = new SeedHistoryManager({ onSelectSeed });
    manager.updateUI(CURRENT, false, false);

    keepToggle('charlie')?.click();

    expect(onSelectSeed).not.toHaveBeenCalled();
    expect(manager.getSeeds()).toEqual([...SEEDS]);
  });

  it('persists kept state across reloads', () => {
    const manager = createManager();
    manager.setKept('charlie', true);

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')).toEqual([
      'alpha',
      'bravo',
      { seed: 'charlie', kept: true },
    ]);
    const reloaded = new SeedHistoryManager({ onSelectSeed: vi.fn() });
    expect(reloaded.getKeptSeeds()).toEqual(['charlie']);
  });

  it('a kept seed survives six regrows', () => {
    const manager = createManager();
    manager.setKept('charlie', true);
    for (const seed of seedsN('grow', 6)) manager.addSeed(seed);

    expect(manager.getSeeds()).toContain('charlie');
    expect(manager.getSeeds().filter((s) => s !== 'charlie')).toHaveLength(RECENT_CAP);
  });

  it('announces instead of silently dropping when the kept cap is full', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...seedsN('keep', KEPT_CAP).map((seed) => ({ seed, kept: true })), 'extra']),
    );
    const manager = new SeedHistoryManager({ onSelectSeed: vi.fn() });

    expect(manager.setKept('extra', true)).toBe(false);
    expect(manager.getKeptSeeds()).toHaveLength(KEPT_CAP);
    expect(manager.getSeeds()).toContain('extra');
    expect(announce).toHaveBeenCalledWith(`You can keep up to ${KEPT_CAP} seeds. Unkeep one to keep extra.`);
  });

  it('Clear removes only unkept seeds and counts only them', () => {
    const manager = createManager();
    manager.setKept('bravo', true);
    manager.updateUI(CURRENT, false, false);
    const clearBtn = document.getElementById('btn-clear-history') as HTMLButtonElement;
    expect(clearBtn.textContent).toBe('Clear (2)');

    manager.clear(CURRENT, false, false);

    expect(manager.getSeeds()).toEqual(['bravo']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')).toEqual([{ seed: 'bravo', kept: true }]);
    // Kept pill stays visible next to the undo banner.
    expect(
      [...document.querySelectorAll('#recent-seeds-list button.seed-pill')].map((b) => b.textContent),
    ).toEqual(['bravo']);
    expect(undoButton()).not.toBeNull();
    expect(document.activeElement?.id).toBe('btn-undo-history');
  });

  it('undo restores exactly what was cleared, in order, with kept state', () => {
    const manager = createManager();
    manager.setKept('bravo', true);

    manager.clear(CURRENT, false, false);
    manager.undoClear(CURRENT, false, false);

    expect(manager.getSeeds()).toEqual([...SEEDS]);
    expect(manager.getKeptSeeds()).toEqual(['bravo']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')).toEqual([
      'alpha',
      { seed: 'bravo', kept: true },
      'charlie',
    ]);
  });

  it('Clear is unavailable when every listed seed is kept', () => {
    const manager = createManager(['alpha']);
    manager.setKept('alpha', true);
    manager.updateUI(CURRENT, false, false);

    const clearBtn = document.getElementById('btn-clear-history') as HTMLButtonElement;
    expect(clearBtn.hidden).toBe(true);
    manager.clear(CURRENT, false, false);
    expect(manager.getSeeds()).toEqual(['alpha']);
    expect(undoButton()).toBeNull();
  });

  it('arrow keys rove pill-to-pill and toggle-to-toggle; the roving chip has two tab stops', () => {
    createManager();
    const pills = [...document.querySelectorAll<HTMLButtonElement>('#recent-seeds-list button.seed-pill')];
    const tabStops = () =>
      [...document.querySelectorAll<HTMLButtonElement>('#recent-seeds-list button')].filter((b) => b.tabIndex === 0);
    expect(tabStops()).toEqual([pills[0], keepToggle('alpha')]);

    pills[0].focus();
    pills[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(pills[1]);
    expect(tabStops()).toEqual([pills[1], keepToggle('bravo')]);

    keepToggle('bravo')?.focus();
    keepToggle('bravo')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(keepToggle('alpha'));
    expect(tabStops()).toEqual([pills[0], keepToggle('alpha')]);
  });
});

describe('SeedHistoryManager cross-tab sync', () => {
  const emit = (key: string | null, newValue: string | null, storageArea: Storage = localStorage) =>
    window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea }));
  const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    localStorage.clear();
    mountHistoryDom();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function make(onExternalChange = vi.fn()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEEDS));
    return { manager: new SeedHistoryManager({ onSelectSeed: vi.fn(), onExternalChange }), onExternalChange };
  }

  it('adopts an external kept entry and keeps it when this tab adds a seed', () => {
    const { manager, onExternalChange } = make();
    emit(STORAGE_KEY, JSON.stringify(['alpha', { seed: 'bravo', kept: true }, 'charlie']));
    expect(manager.getKeptSeeds()).toEqual(['bravo']);
    expect(onExternalChange).toHaveBeenCalledTimes(1);
    manager.addSeed('delta');
    expect(stored()).toEqual(['delta', 'alpha', { seed: 'bravo', kept: true }, 'charlie']);
  });

  it('ignores unrelated keys', () => {
    const { manager, onExternalChange } = make();
    emit('other', JSON.stringify(['zulu']));
    expect(manager.getSeeds()).toEqual([...SEEDS]);
    expect(onExternalChange).not.toHaveBeenCalled();
  });

  it('ignores events from a different storage area', () => {
    const { manager, onExternalChange } = make();
    emit(STORAGE_KEY, JSON.stringify(['zulu']), sessionStorage);
    expect(manager.getSeeds()).toEqual([...SEEDS]);
    expect(onExternalChange).not.toHaveBeenCalled();
  });

  it('empties the list for null newValue and for key === null', () => {
    const { manager } = make();
    emit(STORAGE_KEY, null);
    expect(manager.getSeeds()).toEqual([]);
    emit(STORAGE_KEY, JSON.stringify(['alpha']));
    expect(manager.getSeeds()).toEqual(['alpha']);
    emit(null, null);
    expect(manager.getSeeds()).toEqual([]);
  });

  it('warns on malformed JSON without throwing or changing entries', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { manager, onExternalChange } = make();
    expect(() => emit(STORAGE_KEY, '{nope')).not.toThrow();
    expect(warn).toHaveBeenCalled();
    expect(manager.getSeeds()).toEqual([...SEEDS]);
    expect(onExternalChange).not.toHaveBeenCalled();
  });

  it('never writes to localStorage from the handler', () => {
    make();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    emit(STORAGE_KEY, JSON.stringify(['alpha']));
    expect(setItem).not.toHaveBeenCalled();
  });

  it('ignores events during the undo window, then re-reads storage when it closes', () => {
    const { manager, onExternalChange } = make();
    manager.updateUI(CURRENT, false, false);
    manager.clear(CURRENT, false, false);
    const external = JSON.stringify([{ seed: 'bravo', kept: true }]);
    emit(STORAGE_KEY, external);
    expect(onExternalChange).not.toHaveBeenCalled();
    expect(manager.getSeeds()).toEqual([]);
    localStorage.setItem(STORAGE_KEY, external);
    vi.advanceTimersByTime(10000);
    expect(manager.getKeptSeeds()).toEqual(['bravo']);
    expect(onExternalChange).toHaveBeenCalledTimes(1);
  });

  it('still restores cleared seeds with Undo after an ignored event', () => {
    const { manager } = make();
    manager.updateUI(CURRENT, false, false);
    manager.clear(CURRENT, false, false);
    emit(STORAGE_KEY, JSON.stringify(['zulu']));
    manager.undoClear(CURRENT, false, false);
    expect(manager.getSeeds()).toEqual([...SEEDS]);
  });
});
