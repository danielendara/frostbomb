import './style.css';
import { createScene } from './snowflake/scene.ts';
import { buildSnowflake } from './snowflake/geometry.ts';
import { sampleConditions, habitLabel, getHabit, GrowthConditions } from './snowflake/nakaya.ts';
import { mulberry32, resolveSeed, hashString, Rand } from './snowflake/random.ts';
import { initNakayaDiagram } from './snowflake/diagram.ts';

type TweakpanePane = import('tweakpane').Pane;

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = createScene(canvas);

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

const nakayaCanvas = document.getElementById('nakaya-diagram') as HTMLCanvasElement;
const nakayaDiagram = initNakayaDiagram(nakayaCanvas);

// Performance Optimization: DOM caching and change detection.
// Drastically reduces layout work and attribute churn during "Lab Mode" slider updates.
const DOM_CACHE = new Map<string, HTMLElement>();
const ROW_CACHE = new Map<string, HTMLElement>();
const LAST_TEXT = new Map<string, string>();
const LAST_ARIA = new Map<string, string>();
let lastNakayaAria = '';
let lastCanvasAria = '';
let lastSeedAria = '';
let lastTitle = '';

let isLabMode = false;
let isGuideOpen = false;
let isUIHidden = false;
let guideReturnTarget: HTMLElement | null = null;
let currentConditions: GrowthConditions;
let lastHabit: string | null = null;
let currentSeedLabel: string;
let currentSeed: { seed: number; label: string } | null = null;

// Recent seeds history tracking state
const STORAGE_KEY = 'frostbomb-recent-seeds';
let recentSeeds: string[] = [];
let backupRecentSeeds: string[] | null = null;
let undoTimeoutId: number | null = null;

try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      recentSeeds = parsed.filter(s => typeof s === 'string' && /^[a-z0-9]{3,12}$/i.test(s)).slice(0, 5);
    }
  }
} catch (e) {
  console.warn('Failed to parse recent seeds from localStorage:', e);
}

function updateRecentSeedsUI() {
  const container = document.getElementById('recent-seeds-container');
  const listEl = document.getElementById('recent-seeds-list');
  if (!container || !listEl) return;

  // If guide is open or lab mode is active, we can optionally hide it to avoid crowding, or let it adapt.
  // Standard: show when guide is closed and not in lab mode, or adapt naturally.
  if (isGuideOpen || isLabMode) {
    container.style.display = 'none';
    return;
  }

  if (recentSeeds.length === 0) {
    if (backupRecentSeeds && (backupRecentSeeds as string[]).length > 0) {
      container.style.display = 'flex';
      listEl.innerHTML = '';

      const infoSpan = document.createElement('span');
      infoSpan.style.color = 'var(--ink-dim)';
      infoSpan.style.fontSize = '0.65rem';
      infoSpan.textContent = 'History cleared. ';

      const undoBtn = document.createElement('button');
      undoBtn.id = 'btn-undo-history';
      undoBtn.className = 'seed-btn';
      undoBtn.style.padding = '0.15rem 0.35rem';
      undoBtn.style.fontSize = '0.65rem';
      undoBtn.style.border = '1px solid var(--rule)';
      undoBtn.style.borderRadius = '4px';
      undoBtn.style.background = 'transparent';
      undoBtn.style.color = 'var(--accent)';
      undoBtn.style.fontFamily = 'var(--mono)';
      undoBtn.style.cursor = 'pointer';
      undoBtn.style.textTransform = 'lowercase';
      undoBtn.title = 'Undo clearing seed history';
      undoBtn.setAttribute('aria-label', 'Undo clearing seed history');
      undoBtn.textContent = 'undo';

      undoBtn.addEventListener('mouseenter', () => {
        undoBtn.style.background = 'rgba(230, 237, 245, 0.1)';
        undoBtn.style.color = 'var(--ink)';
      });
      undoBtn.addEventListener('mouseleave', () => {
        undoBtn.style.background = 'transparent';
        undoBtn.style.color = 'var(--accent)';
      });
      undoBtn.addEventListener('focus', () => {
        undoBtn.style.background = 'rgba(230, 237, 245, 0.1)';
        undoBtn.style.color = 'var(--ink)';
      });
      undoBtn.addEventListener('blur', () => {
        undoBtn.style.background = 'transparent';
        undoBtn.style.color = 'var(--accent)';
      });

      undoBtn.addEventListener('click', () => {
        visualPress(undoBtn);
        recentSeeds = backupRecentSeeds || [];
        backupRecentSeeds = null;
        if (undoTimeoutId !== null) {
          clearTimeout(undoTimeoutId);
          undoTimeoutId = null;
        }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(recentSeeds));
        } catch (e) {
          console.warn('Failed to save recent seeds to localStorage:', e);
        }
        updateRecentSeedsUI();
        announce('Recent seeds history restored');

        setTimeout(() => {
          document.getElementById('btn-clear-history')?.focus();
        }, 50);
      });

      listEl.appendChild(infoSpan);
      listEl.appendChild(undoBtn);
      return;
    }

    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  listEl.innerHTML = '';

  recentSeeds.forEach((seedVal) => {
    const btn = document.createElement('button');
    btn.className = 'seed-btn';
    btn.style.padding = '0.15rem 0.35rem';
    btn.style.fontSize = '0.65rem';
    btn.style.border = '1px solid var(--rule)';
    btn.style.borderRadius = '4px';
    const isActive = seedVal === currentSeedLabel;
    btn.style.background = isActive ? 'rgba(158, 201, 255, 0.15)' : 'transparent';
    btn.style.color = isActive ? 'var(--accent)' : 'var(--ink-dim)';
    btn.style.fontFamily = 'var(--mono)';
    btn.style.cursor = 'pointer';
    btn.style.textTransform = 'lowercase';
    const tooltipText = `Grow seed ${seedVal}${isActive ? ' (currently active)' : ''}`;
    btn.setAttribute('aria-label', tooltipText);
    btn.title = tooltipText;
    btn.textContent = seedVal;

    if (!isActive) {
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(230, 237, 245, 0.1)';
        btn.style.color = 'var(--ink)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--ink-dim)';
      });
      btn.addEventListener('focus', () => {
        btn.style.background = 'rgba(230, 237, 245, 0.1)';
        btn.style.color = 'var(--ink)';
      });
      btn.addEventListener('blur', () => {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--ink-dim)';
      });
    }

    btn.addEventListener('keydown', (e: KeyboardEvent) => {
      const buttons = Array.from(listEl.querySelectorAll('button'));
      const idx = buttons.indexOf(btn);
      if (idx === -1) return;

      let nextIdx: number | null = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIdx = (idx + 1) % buttons.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIdx = (idx - 1 + buttons.length) % buttons.length;
      }

      if (nextIdx !== null) {
        e.preventDefault();
        e.stopPropagation();
        buttons[nextIdx].focus();
      }
    });

    btn.addEventListener('click', () => {
      if (seedVal === currentSeedLabel) return;
      visualPress(btn);
      currentSeed = {
        seed: hashString(seedVal),
        label: seedVal,
      };
      const url = new URL(window.location.href);
      url.searchParams.set('seed', seedVal);
      window.history.replaceState(null, '', url.pathname + url.search);
      grow(undefined, true, true);
    });

    listEl.appendChild(btn);
  });
}

function addRecentSeed(seedVal: string) {
  if (!seedVal || !/^[a-z0-9]{3,12}$/i.test(seedVal)) return;

  // Performance optimization: prevent layout thrashing and redundant localStorage/DOM writes
  if (recentSeeds[0] === seedVal) {
    updateRecentSeedsUI();
    return;
  }

  if (undoTimeoutId !== null) {
    clearTimeout(undoTimeoutId);
    undoTimeoutId = null;
  }
  backupRecentSeeds = null;

  recentSeeds = [seedVal, ...recentSeeds.filter(s => s !== seedVal)].slice(0, 5);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recentSeeds));
  } catch (e) {
    console.warn('Failed to save recent seeds to localStorage:', e);
  }
  updateRecentSeedsUI();
}

const labParams = {
  seed: '····',
  temperature: -15,
  temperatureF: 5,
  supersaturation: 80,
  habit: '—',
};

let pane: TweakpanePane | null = null;
let panePromise: Promise<TweakpanePane> | null = null;
let labToggleGeneration = 0;

async function ensurePane(): Promise<TweakpanePane> {
  if (pane) return pane;
  if (panePromise) return panePromise;

  panePromise = import('tweakpane').then(({ Pane }) => {
    const paneContainer = document.getElementById('pane-mount');
    const p = new Pane({
      container: paneContainer ?? undefined,
      title: 'Growth parameters',
    });

    p.addBinding(labParams, 'seed', {
      label: 'Seed',
    }).on('change', (ev) => {
      const val = (ev.value || '').trim().toLowerCase();
      if (val === currentSeedLabel) return;

      if (/^[a-z0-9]{3,12}$/.test(val)) {
        currentSeed = {
          seed: hashString(val),
          label: val,
        };
        const url = new URL(window.location.href);
        url.searchParams.set('seed', val);
        window.history.replaceState(null, '', url.pathname + url.search);

        grow(currentConditions, true, false);
        announce(`Seed changed to ${val}`);
      } else {
        announce("Invalid seed. Seeds must be 3 to 12 alphanumeric characters.");
        setTemporaryLabel('btn-seed', '3-12 chars', '✕', true);

        // Direct inline visual error feedback for Tweakpane's Seed input
        const labelViews = document.querySelectorAll('.tp-lblv');
        let seedInputEl: HTMLInputElement | null = null;
        for (const lv of labelViews) {
          if (lv.textContent?.toLowerCase().includes('seed')) {
            seedInputEl = lv.querySelector('input') as HTMLInputElement;
            break;
          }
        }
        if (seedInputEl) {
          seedInputEl.style.outline = '2px solid #ff6b6b';
          seedInputEl.style.outlineOffset = '2px';
          seedInputEl.style.transition = 'outline 0.2s ease, background-color 0.2s ease';
          seedInputEl.style.backgroundColor = 'rgba(255, 107, 107, 0.15)';
          setTimeout(() => {
            if (seedInputEl) {
              seedInputEl.style.outline = '';
              seedInputEl.style.outlineOffset = '';
              seedInputEl.style.transition = '';
              seedInputEl.style.backgroundColor = '';
            }
          }, 1500);
        }

        labParams.seed = currentSeedLabel;
        p.refresh();
      }
    });

    p.addButton({
      title: 'Randomize Seed',
    }).on('click', () => {
      const result = grow(currentConditions, false, false);
      const url = new URL(window.location.href);
      url.searchParams.set('seed', result.label);
      window.history.replaceState(null, '', url.pathname + url.search);
      announce(`Randomized seed to ${result.label}`);
    });

    p.addBinding(labParams, 'temperature', {
      min: -40,
      max: 0,
      step: 0.5,
      label: 'Temp (°C)',
    }).on('change', () => updateFromPane());

    p.addBinding(labParams, 'temperatureF', {
      readonly: true,
      label: 'Temp (°F)',
    });

    p.addBinding(labParams, 'supersaturation', {
      min: 0,
      max: 100,
      step: 1,
      label: 'Humidity (%)',
    }).on('change', () => updateFromPane());

    p.addBinding(labParams, 'habit', { readonly: true, label: 'Habit' });

    pane = p;
    return p;
  });

  return panePromise;
}

function updateNakayaStatus(temp: number, ss: number, isPreview: boolean) {
  const statusEl = document.getElementById('nakaya-status');
  if (!statusEl) return;
  const habit = getHabit(temp, ss);
  const habitText = habitLabel[habit];
  const humPct = Math.round(ss * 100);
  const tempStr = temp.toFixed(1);
  if (isPreview) {
    statusEl.setAttribute('aria-live', 'off');
    statusEl.innerHTML = `Preview: <span style="color: var(--accent);">${tempStr}°C</span>, <span style="color: var(--accent);">${humPct}%</span> • <em>${habitText}</em>`;
  } else {
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.innerHTML = `Active: <span style="color: var(--accent-hot);">${tempStr}°C</span>, <span style="color: var(--accent-hot);">${humPct}%</span> • <strong>${habitText}</strong>`;
  }
}

function grow(manualConditions?: GrowthConditions, keepSeed = false, animate = true) {
  const isNewSeed = !keepSeed || !currentSeed;
  if (isNewSeed) {
    currentSeed = resolveSeed();
  }

  const { seed, label } = currentSeed!;
  currentSeedLabel = label;
  const rng = mulberry32(seed);
  const rand = new Rand(rng);

  const conditions = manualConditions || sampleConditions(rand);
  currentConditions = conditions;
  const result = buildSnowflake(conditions, rand);

  scene.updateFlake(result, animate);
  nakayaDiagram?.update(conditions.path);

  if (canvas) {
    const canvasAria = `3D procedural snowflake visualization: a ${habitLabel[conditions.habit]} (Seed: ${label})`;
    if (lastCanvasAria !== canvasAria) {
      canvas.setAttribute('aria-label', canvasAria);
      lastCanvasAria = canvasAria;
    }
  }

  const title = `${habitLabel[conditions.habit]} — frostbomb`;
  if (lastTitle !== title) {
    document.title = title;
    lastTitle = title;
  }

  const btnSeed = document.getElementById('btn-seed');
  if (btnSeed) {
    const seedAria = `Copy share link for seed ${label}`;
    if (lastSeedAria !== seedAria) {
      btnSeed.setAttribute('aria-label', seedAria);
      lastSeedAria = seedAria;
    }
  }

  const tempF = (conditions.temperatureC * 9 / 5) + 32;
  const tempText = `${conditions.temperatureC.toFixed(1)} °C / ${tempF.toFixed(1)} °F`;
  const humidText = `${(conditions.supersaturation * 100).toFixed(0)}%`;
  const habitText = habitLabel[conditions.habit];

  setText('seed-display', label);
  setText('stat-temp', tempText);
  setText('stat-humid', humidText);
  setText('stat-habit', habitText);

  const habitChanged = lastHabit && lastHabit !== habitText;
  if ((animate && isNewSeed) || habitChanged) {
    const animateIds = (animate && isNewSeed) ? ['stat-habit', 'seed-display'] : ['stat-habit'];
    animateIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('section-highlight');
        void el.offsetWidth;
        el.classList.add('section-highlight');
      }
    });
  }
  lastHabit = habitText;

  setText('stat-branches', `${result.branchCount}`);

  updateRowAria('stat-temp', 'Temperature', tempText);
  updateRowAria('stat-humid', 'Supersaturation', humidText);
  updateRowAria('stat-habit', 'Habit', habitText);
  updateRowAria('stat-branches', 'Branches', `${result.branchCount}`);

  // Always sync labParams so Lab Mode starts from the current snowflake's conditions
  labParams.seed = label;
  labParams.habit = habitLabel[conditions.habit];
  labParams.temperature = conditions.temperatureC;
  labParams.temperatureF = (conditions.temperatureC * 9 / 5) + 32;
  labParams.supersaturation = conditions.supersaturation * 100;
  pane?.refresh();

  addRecentSeed(label);

  updateNakayaStatus(conditions.temperatureC, conditions.supersaturation, false);

  return { conditions, label };
}

function setText(id: string, value: string) {
  if (LAST_TEXT.get(id) === value) return;

  let el = DOM_CACHE.get(id);
  if (!el) {
    el = document.getElementById(id) || undefined;
    if (el) DOM_CACHE.set(id, el);
  }

  if (el) {
    el.textContent = value;
    LAST_TEXT.set(id, value);
  }
}

function updateRowAria(ddId: string, label: string, value: string) {
  let row = ROW_CACHE.get(ddId);
  if (!row) {
    const dd = document.getElementById(ddId);
    row = (dd?.closest('.field-notes__row') as HTMLElement) || undefined;
    if (row) ROW_CACHE.set(ddId, row);
  }

  if (row) {
    const isButton = row.getAttribute('role') === 'button';
    const interactionHint = isButton ? '. Click to learn more in the field guide.' : '.';
    const ariaLabel = `${label}: ${value}${interactionHint}`;

    if (LAST_ARIA.get(ddId) !== ariaLabel) {
      row.setAttribute('aria-label', ariaLabel);
      LAST_ARIA.set(ddId, ariaLabel);
    }
  }
}

function setTemporaryLabel(id: string, tempText: string, tempIcon?: string, isError = false, isSuccess = false) {
  const btn = document.getElementById(id);
  if (!btn) return;

  const labelEl = btn.querySelector('.action-btn__label, #seed-display, .refresh__label') as HTMLElement;
  const iconEl = btn.querySelector('.action-btn__icon, .seed-btn__icon, .refresh__icon') as HTMLElement;

  if (!labelEl) return;

  // Prevent race condition: store original values if not already stored
  if (!labelEl.hasAttribute('data-original')) {
    labelEl.setAttribute('data-original', labelEl.textContent || '');
  }
  if (iconEl && !iconEl.hasAttribute('data-original')) {
    iconEl.setAttribute('data-original', iconEl.textContent || '');
  }

  labelEl.textContent = tempText;
  if (iconEl && tempIcon) iconEl.textContent = tempIcon;

  if (isError) {
    btn.classList.add('btn--error');
    btn.classList.remove('btn--success');
  } else if (isSuccess) {
    btn.classList.add('btn--success');
    btn.classList.remove('btn--error');
  } else {
    btn.classList.remove('btn--error');
    btn.classList.remove('btn--success');
  }

  const existingTimeout = btn.getAttribute('data-timeout-id');
  if (existingTimeout) clearTimeout(parseInt(existingTimeout));

  const labelDuration = (window as any).__FROSTBOMB_LABEL_TIMEOUT__ !== undefined
    ? (window as any).__FROSTBOMB_LABEL_TIMEOUT__
    : 2000;

  const timeoutId = window.setTimeout(() => {
    const originalLabel = labelEl.getAttribute('data-original');
    if (originalLabel !== null) {
      labelEl.textContent = originalLabel;
      labelEl.removeAttribute('data-original');
    }

    if (iconEl) {
      const originalIcon = iconEl.getAttribute('data-original');
      if (originalIcon !== null) {
        iconEl.textContent = originalIcon;
        iconEl.removeAttribute('data-original');
      }
    }
    btn.classList.remove('btn--error');
    btn.classList.remove('btn--success');
    btn.removeAttribute('data-timeout-id');
  }, labelDuration);

  btn.setAttribute('data-timeout-id', timeoutId.toString());
}

function visualPress(idOrEl: string | HTMLElement) {
  const el = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
  if (!el) return;
  el.classList.remove('btn-press');
  void (el as HTMLElement).offsetWidth; // Trigger reflow
  el.classList.add('btn-press');
}

function triggerFlash() {
  if (motionQuery.matches) return;
  const el = document.getElementById('flash-overlay');
  if (!el) return;
  el.classList.remove('camera-flash');
  void el.offsetWidth;
  el.classList.add('camera-flash');
}

function announce(message: string) {
  const announcer = document.getElementById('a11y-announcer');
  if (announcer) {
    announcer.textContent = '';
    // Small delay to ensure the DOM change is registered so identical consecutive messages are re-read
    setTimeout(() => {
      announcer.textContent = message;
    }, 50);
  }
}

function handleRefresh(e?: Event) {
  if (e instanceof MouseEvent && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return;
  if (e) e.preventDefault();
  visualPress('refresh');
  const wordmark = document.querySelector('.wordmark-link');
  if (wordmark) visualPress(wordmark as HTMLElement);
  const dot = document.querySelector('.wordmark__accent');
  if (dot) {
    dot.classList.remove('animate-spin-once');
    void (dot as HTMLElement).offsetWidth;
    dot.classList.add('animate-spin-once');
  }
  const refreshIcon = document.querySelector('.refresh__icon');
  if (refreshIcon) {
    refreshIcon.classList.remove('animate-spin-once');
    void (refreshIcon as HTMLElement).offsetWidth;
    refreshIcon.classList.add('animate-spin-once');
  }
  window.history.replaceState(null, '', window.location.pathname);
  const { conditions, label } = grow(isLabMode ? currentConditions : undefined);
  announce(`New snowflake grown: ${habitLabel[conditions.habit]} (Seed: ${label})`);
}

document.getElementById('refresh')?.addEventListener('click', handleRefresh);
document.querySelector('.wordmark-link')?.addEventListener('click', handleRefresh);

const labToggle = document.getElementById('lab-toggle');
const guideToggle = document.getElementById('guide-toggle');
const labControls = document.getElementById('lab-controls');
const fieldGuide = document.getElementById('field-guide');
const statsDisplay = document.getElementById('stats-display');
const labStatus = document.getElementById('lab-status');

async function toggleLabMode() {
  isLabMode = !isLabMode;
  visualPress('lab-toggle');
  const toggleGeneration = ++labToggleGeneration;

  if (labToggle) {
    labToggle.setAttribute('aria-pressed', isLabMode.toString());
    labToggle.setAttribute('aria-expanded', isLabMode.toString());
  }
  if (nakayaCanvas) {
    nakayaCanvas.setAttribute('aria-pressed', isLabMode.toString());
    nakayaCanvas.setAttribute('aria-expanded', isLabMode.toString());
  }
  if (labControls) labControls.style.display = isLabMode ? 'flex' : 'none';
  if (statsDisplay) statsDisplay.style.display = isGuideOpen ? 'none' : 'flex';
  if (labStatus) {
    labStatus.textContent = isLabMode ? 'ON' : 'OFF';
  }

  updateRecentSeedsUI();

  if (isLabMode) {
    announce('Lab Mode active');
    if (!pane && labStatus) {
      labStatus.textContent = 'LOADING...';
      if (labToggle instanceof HTMLButtonElement) labToggle.disabled = true;
      announce('Loading lab controls');
    }
    try {
      await ensurePane();
    } catch (err) {
      console.error('Failed to load Lab Mode:', err);
      if (labStatus) {
        labStatus.textContent = 'ERROR';
        labStatus.classList.add('btn--error');
      }
      isLabMode = false;
      if (labToggle) {
        labToggle.setAttribute('aria-pressed', 'false');
        labToggle.setAttribute('aria-expanded', 'false');
      }
      announce('Failed to load Lab Mode controls');
      return;
    } finally {
      if (labToggle instanceof HTMLButtonElement) labToggle.disabled = false;
    }
    if (!isLabMode || toggleGeneration !== labToggleGeneration) return;
    if (labStatus) {
      labStatus.textContent = 'ON';
    }
    updateFromPane(false);
  } else {
    grow(undefined, true);
    announce('Lab Mode disabled');
    if (labToggle) labToggle.focus();
  }
}

function toggleFieldGuide(target: HTMLElement | null | Event = null) {
  isGuideOpen = !isGuideOpen;
  visualPress('guide-toggle');

  if (isGuideOpen && target instanceof HTMLElement) {
    guideReturnTarget = target;
  }

  if (guideToggle) {
    guideToggle.setAttribute('aria-pressed', isGuideOpen.toString());
    guideToggle.setAttribute('aria-expanded', isGuideOpen.toString());
  }
  if (fieldGuide) {
    fieldGuide.style.display = isGuideOpen ? 'block' : 'none';
    if (isGuideOpen) {
      fieldGuide.scrollTop = 0;
      fieldGuide.focus();
    } else {
      const restoreTo = guideReturnTarget || guideToggle;
      requestAnimationFrame(() => restoreTo?.focus());
      guideReturnTarget = null;
    }
  }
  if (statsDisplay) statsDisplay.style.display = isGuideOpen ? 'none' : 'flex';

  updateRecentSeedsUI();
}

function navigateToGuideSection(targetId: string, returnTarget: HTMLElement | null = null) {
  if (!isGuideOpen) {
    toggleFieldGuide(returnTarget);
  } else if (returnTarget) {
    guideReturnTarget = returnTarget;
  }

  requestAnimationFrame(() => {
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.focus();
      el.classList.remove('section-highlight');
      void el.offsetWidth;
      el.classList.add('section-highlight');
    }
  });
}

labToggle?.addEventListener('click', toggleLabMode);
guideToggle?.addEventListener('click', toggleFieldGuide);
document.getElementById('guide-close')?.addEventListener('click', (e) => {
  visualPress('guide-close');
  toggleFieldGuide(e);
});
document.getElementById('lab-close')?.addEventListener('click', () => {
  visualPress('lab-close');
  toggleLabMode();
});

document.getElementById('btn-clear-history')?.addEventListener('click', () => {
  visualPress('btn-clear-history');

  if (undoTimeoutId !== null) {
    clearTimeout(undoTimeoutId);
    undoTimeoutId = null;
  }

  backupRecentSeeds = [...recentSeeds];
  recentSeeds = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to remove recent seeds from localStorage:', e);
  }

  updateRecentSeedsUI();
  announce('Recent seeds history cleared. You can undo this action.');

  requestAnimationFrame(() => {
    const undoBtn = document.getElementById('btn-undo-history');
    if (undoBtn) {
      undoBtn.focus();
    } else {
      const focusTarget = document.getElementById('guide-toggle');
      if (focusTarget) {
        focusTarget.focus();
      }
    }
  });

  const timeoutDuration = (window as any).__FROSTBOMB_UNDO_TIMEOUT__ !== undefined
    ? (window as any).__FROSTBOMB_UNDO_TIMEOUT__
    : 10000;

  undoTimeoutId = window.setTimeout(() => {
    backupRecentSeeds = null;
    undoTimeoutId = null;
    updateRecentSeedsUI();
    if (document.activeElement?.id === 'btn-undo-history') {
      const focusTarget = document.getElementById('guide-toggle');
      if (focusTarget) {
        focusTarget.focus();
      }
    }
  }, timeoutDuration);
});

document.querySelectorAll('.field-notes__row[role="button"]').forEach((row) => {
  const handler = () => {
    visualPress(row as HTMLElement);
    const label = row.querySelector('dt')?.textContent?.trim();
    const targets: Record<string, string> = {
      Temperature: 'guide-temp',
      Supersaturation: 'guide-humid',
      Habit: 'guide-habit',
      Branches: 'guide-branches',
    };
    const targetId = targets[label || ''];

    if (targetId) {
      navigateToGuideSection(targetId, row as HTMLElement);
    }
  };

  row.addEventListener('click', handler);
  row.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Enter' || ke.key === ' ') {
      e.preventDefault();
      handler();
    }
  });
});

function handleNakayaPointer(e: PointerEvent) {
  if (!nakayaCanvas) return;
  if (e.type === 'pointerdown') {
    visualPress('nakaya-diagram');
  }
  const rect = nakayaCanvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

  const t = x * 40 - 40;
  const ss = 1 - y;

  labParams.temperature = t;
  labParams.supersaturation = ss * 100;

  if (!isLabMode) {
    toggleLabMode();
  } else {
    updateFromPane(false);
  }
}

nakayaCanvas?.addEventListener('pointerdown', (e) => {
  nakayaCanvas.setPointerCapture(e.pointerId);
  handleNakayaPointer(e);
});

nakayaCanvas?.addEventListener('pointermove', (e) => {
  if (e.buttons > 0) {
    handleNakayaPointer(e);
  } else {
    const rect = nakayaCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const t = x * 40 - 40;
    const ss = 1 - y;
    updateNakayaStatus(t, ss, true);
  }
});

nakayaCanvas?.addEventListener('pointerleave', () => {
  if (currentConditions) {
    updateNakayaStatus(currentConditions.temperatureC, currentConditions.supersaturation, false);
  }
});

nakayaCanvas?.addEventListener('keydown', (e: Event) => {
  const { key } = e as KeyboardEvent;
  const isNav = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(key);
  const isAction = key === ' ' || key === 'Enter';

  if (isNav || isAction) {
    e.preventDefault();
    e.stopPropagation();

    if (!isLabMode) {
      toggleLabMode();
    }

    if (isNav) {
      const ke = e as KeyboardEvent;
      const multiplier = ke.shiftKey ? 3 : 1;
      const tStep = 1 * multiplier;
      const ssStep = 5 * multiplier;
      let changed = false;

      if (key === 'ArrowLeft') { labParams.temperature = Math.max(-40, labParams.temperature - tStep); changed = true; }
      if (key === 'ArrowRight') { labParams.temperature = Math.min(0, labParams.temperature + tStep); changed = true; }
      if (key === 'ArrowUp') { labParams.supersaturation = Math.min(100, labParams.supersaturation + ssStep); changed = true; }
      if (key === 'ArrowDown') { labParams.supersaturation = Math.max(0, labParams.supersaturation - ssStep); changed = true; }

      if (key === 'Home') { labParams.temperature = -40; changed = true; }
      if (key === 'End') { labParams.temperature = 0; changed = true; }
      if (key === 'PageUp') { labParams.supersaturation = Math.min(100, labParams.supersaturation + 25); changed = true; }
      if (key === 'PageDown') { labParams.supersaturation = Math.max(0, labParams.supersaturation - 25); changed = true; }

      if (changed) {
        visualPress('nakaya-diagram');
        updateFromPane(true);
      }
    }
  }
});

function updateFromPane(shouldAnnounce = false) {
  const t = labParams.temperature;
  const ss = labParams.supersaturation / 100;
  const habit = getHabit(t, ss);
  const habitText = habitLabel[habit];

  if (nakayaCanvas) {
    const nakayaAria = `Nakaya morphology diagram: ${t.toFixed(1)}°C, ${labParams.supersaturation.toFixed(0)}% humidity. Resulting habit: ${habitText}. Use arrow keys to adjust.`;
    if (lastNakayaAria !== nakayaAria) {
      nakayaCanvas.setAttribute('aria-label', nakayaAria);
      lastNakayaAria = nakayaAria;
    }
  }

  if (shouldAnnounce) {
    announce(`Temperature: ${t.toFixed(1)}°C, Humidity: ${labParams.supersaturation.toFixed(0)}%: ${habitText}`);
  } else if (lastHabit && lastHabit !== habitText) {
    announce(`Habit changed to: ${habitText}`);
  }

  const conditions: GrowthConditions = {
    temperatureC: t,
    supersaturation: ss,
    habit: habit,
    path: [{ temp: t, ss: ss }], // Manual path is just the point
  };
  labParams.habit = habitText;
  pane?.refresh();

  grow(conditions, true, false);
}

async function copyLink() {
  const url = `${window.location.origin}${window.location.pathname}?seed=${currentSeedLabel}`;
  visualPress('btn-copy');
  visualPress('btn-seed');

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
    } else {
      throw new Error('Clipboard API unavailable');
    }
    setTemporaryLabel('btn-copy', 'Copied!', '✓', false, true);
    setTemporaryLabel('btn-seed', 'Copied!', '✓', false, true);
    announce(`Link copied for seed ${currentSeedLabel}`);
  } catch (err) {
    console.warn('Clipboard API failed, trying legacy fallback:', err);
    try {
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (!successful) {
        throw new Error('execCommand copy failed');
      }
      setTemporaryLabel('btn-copy', 'Copied!', '✓', false, true);
      setTemporaryLabel('btn-seed', 'Copied!', '✓', false, true);
      announce(`Link copied for seed ${currentSeedLabel}`);
    } catch (fallbackErr) {
      console.error('Legacy fallback failed:', fallbackErr);
      setTemporaryLabel('btn-copy', 'Failed', '✕', true);
      setTemporaryLabel('btn-seed', 'Failed', '✕', true);
      announce('Failed to copy link');
    }
  }
}

async function copySeedOnly() {
  const seed = currentSeedLabel;
  visualPress('btn-copy-seed');

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(seed);
    } else {
      throw new Error('Clipboard API unavailable');
    }
    setTemporaryLabel('btn-copy-seed', 'Copied!', '✓', false, true);
    announce(`Seed ${seed} copied`);
  } catch (err) {
    console.warn('Clipboard API failed, trying legacy fallback:', err);
    try {
      const textArea = document.createElement('textarea');
      textArea.value = seed;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (!successful) {
        throw new Error('execCommand copy failed');
      }
      setTemporaryLabel('btn-copy-seed', 'Copied!', '✓', false, true);
      announce(`Seed ${seed} copied`);
    } catch (fallbackErr) {
      console.error('Legacy fallback failed:', fallbackErr);
      setTemporaryLabel('btn-copy-seed', 'Failed', '✕', true);
      announce('Failed to copy seed');
    }
  }
}

document.getElementById('btn-copy')?.addEventListener('click', copyLink);
document.getElementById('btn-seed')?.addEventListener('click', copyLink);
document.getElementById('btn-copy-seed')?.addEventListener('click', copySeedOnly);

async function saveSnowflake() {
  setTemporaryLabel('btn-save', 'Saving...', '⌛');
  visualPress('btn-save');
  announce('Saving snowflake as PNG');

  // Delay to ensure UI updates before heavy rendering
  setTimeout(() => {
    try {
      triggerFlash();
      scene.composer.render();

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const habit = currentConditions.habit.replace(/_/g, '-');
      link.download = `frostbomb-${habit}-${currentSeedLabel}.png`;
      link.href = dataUrl;
      link.click();

      setTemporaryLabel('btn-save', 'Saved!', '✓', false, true);
      announce('Snowflake saved');
    } catch (err) {
      console.error('Failed to save snowflake:', err);
      setTemporaryLabel('btn-save', 'Failed', '✕', true);
      announce('Failed to save snowflake');
    }
  }, 100);
}

document.getElementById('btn-save')?.addEventListener('click', saveSnowflake);

const btnPink = document.getElementById('btn-pink');

function togglePinkMode() {
  const enabled = !scene.isPinkModeEnabled;
  visualPress('btn-pink');
  if (btnPink) {
    btnPink.setAttribute('aria-pressed', enabled.toString());
    btnPink.classList.toggle('active', enabled);
  }
  scene.setPinkMode(enabled);
  document.body.classList.toggle('pink-mode', enabled);
  announce(`Pink mode ${enabled ? 'enabled' : 'disabled'}`);
}

btnPink?.addEventListener('click', togglePinkMode);

const btnPrism = document.getElementById('btn-prism');

function togglePrismMode() {
  const enabled = !scene.isPrismModeEnabled;
  visualPress('btn-prism');
  if (btnPrism) {
    btnPrism.setAttribute('aria-pressed', enabled.toString());
    btnPrism.classList.toggle('active', enabled);
  }
  scene.setPrismMode(enabled);
  document.body.classList.toggle('prism-mode', enabled);
  announce(`Prism mode ${enabled ? 'enabled' : 'disabled'}`);
}

btnPrism?.addEventListener('click', togglePrismMode);

const btnRotate = document.getElementById('btn-rotate') as HTMLButtonElement | null;

function updateRotateButtonUI() {
  if (!btnRotate) return;
  const isReduced = motionQuery.matches;

  if (isReduced && scene.isAutoRotateEnabled) {
    scene.setAutoRotate(false);
  }

  const isEnabled = scene.isAutoRotateEnabled;

  btnRotate.setAttribute('aria-pressed', isEnabled.toString());
  btnRotate.classList.toggle('active', isEnabled);

  if (isReduced) {
    btnRotate.disabled = true;
    btnRotate.title = 'Auto-rotation disabled (prefers-reduced-motion)';
    btnRotate.setAttribute('aria-label', 'Auto-Rotate (disabled because prefers-reduced-motion is active)');
  } else {
    btnRotate.disabled = false;
    btnRotate.title = 'Toggle auto-rotation (A)';
    btnRotate.removeAttribute('aria-label');
  }
}

updateRotateButtonUI();
motionQuery.addEventListener('change', updateRotateButtonUI);

function toggleAutoRotate() {
  if (motionQuery.matches) return;
  const enabled = !scene.isAutoRotateEnabled;
  visualPress('btn-rotate');
  scene.setAutoRotate(enabled);
  updateRotateButtonUI();
  announce(`Auto-rotation ${enabled ? 'enabled' : 'disabled'}`);
}

btnRotate?.addEventListener('click', toggleAutoRotate);

const btnUI = document.getElementById('btn-ui');

function toggleUI(forceShow?: boolean) {
  isUIHidden = forceShow === undefined ? !isUIHidden : !forceShow;
  visualPress('btn-ui');

  const uiElements = document.querySelectorAll('.masthead, .field-notes, .footer, .lab-controls');
  uiElements.forEach((el) => el.classList.toggle('ui-hidden', isUIHidden));

  if (btnUI) {
    btnUI.setAttribute('aria-pressed', isUIHidden.toString());
    btnUI.classList.toggle('active', isUIHidden);
  }

  if (isUIHidden) {
    announce('UI hidden. Press H or Esc to show.');
  } else {
    announce('UI visible');
    // Restoration of focus must happen after transitions/visibility updates to be effective.
    setTimeout(() => btnUI?.focus(), 50);
  }
}

btnUI?.addEventListener('click', () => toggleUI());

let canvasPointerDownX = 0;
let canvasPointerDownY = 0;

canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  canvasPointerDownX = e.clientX;
  canvasPointerDownY = e.clientY;
});

canvas.addEventListener('click', (e: MouseEvent) => {
  if (isUIHidden) {
    const dx = e.clientX - canvasPointerDownX;
    const dy = e.clientY - canvasPointerDownY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    // Only exit Photo Mode (restore UI) if it was a stationary tap/click, not a drag.
    if (distance < 6) {
      toggleUI(true);
    }
  }
});
canvas.addEventListener('dblclick', resetView);

function resetView() {
  scene.resetView();
  visualPress('btn-reset');
  setTemporaryLabel('btn-reset', 'Reset!', '⌂', false, true);
  announce('View reset to center');
}

document.getElementById('btn-reset')?.addEventListener('click', resetView);

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  );
}

function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('button, a, [role="button"], [role="link"]'));
}

window.addEventListener('keydown', (e: Event) => {
  const ke = e as KeyboardEvent;
  const k = ke.key.toLowerCase();

  // Global escape should always work to close overlays
  if (k === 'escape') {
    if (isGuideOpen) {
      toggleFieldGuide();
      visualPress('guide-close');
      return;
    } else if (isLabMode) {
      toggleLabMode();
      return;
    } else if (isUIHidden) {
      toggleUI(true);
      return;
    }
  }

  // Never hijack if user is typing or using system modifiers
  if (isTyping(e.target) || ke.metaKey || ke.ctrlKey || ke.altKey) return;

  // Space should activate focused interactive elements (buttons/links) instead of refreshing
  if (k === ' ' && isInteractive(e.target)) return;

  // Don't hijack arrows if we're in the guide (allow scrolling) unless focused on diagram
  const isDiagramFocused = document.activeElement === nakayaCanvas;
  if (isGuideOpen && !isDiagramFocused && k.startsWith('arrow')) return;

  // Space should scroll down the guide instead of refreshing if guide is open and active
  if (k === ' ' && isGuideOpen && !isDiagramFocused) return;

  const delta = ke.shiftKey ? 0.3 : 0.1;
  const actions: Record<string, () => void> = {
    'arrowup': () => (e.preventDefault(), scene.rotateView(0, -delta)),
    'arrowdown': () => (e.preventDefault(), scene.rotateView(0, delta)),
    'arrowleft': () => (e.preventDefault(), scene.rotateView(-delta, 0)),
    'arrowright': () => (e.preventDefault(), scene.rotateView(delta, 0)),
    'r': () => (handleRefresh(), visualPress('refresh')),
    ' ': () => (e.preventDefault(), handleRefresh(), visualPress('refresh')),
    'v': () => (resetView(), visualPress('btn-reset')),
    'g': () => (toggleFieldGuide(), visualPress('guide-toggle')),
    '?': () => (navigateToGuideSection('guide-shortcuts'), visualPress('guide-toggle')),
    'l': () => (toggleLabMode(), visualPress('lab-toggle')),
    'h': () => (toggleUI(), visualPress('btn-ui')),
    'p': () => (togglePinkMode(), visualPress('btn-pink')),
    'm': () => (togglePrismMode(), visualPress('btn-prism')),
    's': () => (saveSnowflake(), visualPress('btn-save')),
    'a': () => (toggleAutoRotate(), visualPress('btn-rotate')),
    'c': () => (copyLink(), visualPress('btn-copy'), visualPress('btn-seed')),
    'k': () => (copySeedOnly(), visualPress('btn-copy-seed')),
  };
  actions[k]?.();
});

grow();
scene.start();
