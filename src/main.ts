import './style.css';
import { createScene } from './snowflake/scene.ts';
import { buildSnowflake } from './snowflake/geometry.ts';
import { sampleConditions, habitLabel, getHabit, GrowthConditions } from './snowflake/nakaya.ts';
import { mulberry32, resolveSeed, Rand } from './snowflake/random.ts';
import { initNakayaDiagram } from './snowflake/diagram.ts';

type TweakpanePane = import('tweakpane').Pane;

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = createScene(canvas);

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

const labParams = {
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

function grow(manualConditions?: GrowthConditions, keepSeed = false, animate = true) {
  if (!keepSeed || !currentSeed) {
    currentSeed = resolveSeed();
  }

  const { seed, label } = currentSeed;
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

  if (lastHabit && lastHabit !== habitText) {
    const habitEl = document.getElementById('stat-habit');
    if (habitEl) {
      habitEl.classList.remove('habit-animate');
      void habitEl.offsetWidth;
      habitEl.classList.add('habit-animate');
    }
  }
  lastHabit = habitText;

  setText('stat-branches', `${result.branchCount}`);

  updateRowAria('stat-temp', 'Temperature', tempText);
  updateRowAria('stat-humid', 'Supersaturation', humidText);
  updateRowAria('stat-habit', 'Habit', habitText);
  updateRowAria('stat-branches', 'Branches', `${result.branchCount}`);

  // Always sync labParams so Lab Mode starts from the current snowflake's conditions
  labParams.habit = habitLabel[conditions.habit];
  labParams.temperature = conditions.temperatureC;
  labParams.temperatureF = (conditions.temperatureC * 9 / 5) + 32;
  labParams.supersaturation = conditions.supersaturation * 100;
  pane?.refresh();
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
  }, 2000);

  btn.setAttribute('data-timeout-id', timeoutId.toString());
}

function visualPress(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('btn-press');
  void el.offsetWidth; // Trigger reflow
  el.classList.add('btn-press');
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
  grow(isLabMode ? currentConditions : undefined);
  announce(`New snowflake grown: ${habitLabel[currentConditions.habit]}`);
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
    labStatus.style.color = isLabMode ? 'var(--accent)' : 'var(--ink-dim)';
  }

  if (isLabMode) {
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
    if (labToggle) labToggle.focus();
  }
}

function toggleFieldGuide(target: HTMLElement | null | Event = null) {
  isGuideOpen = !isGuideOpen;

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
}

labToggle?.addEventListener('click', toggleLabMode);
guideToggle?.addEventListener('click', toggleFieldGuide);
document.getElementById('guide-close')?.addEventListener('click', toggleFieldGuide);

document.querySelectorAll('.field-notes__row[role="button"]').forEach((row) => {
  const handler = () => {
    const label = row.querySelector('dt')?.textContent?.trim();
    const targets: Record<string, string> = {
      'Temperature': 'guide-temp',
      'Supersaturation': 'guide-humid',
      'Habit': 'guide-habit',
      'Branches': 'guide-branches',
    };
    const targetId = targets[label || ''];

    if (targetId) {
      if (!isGuideOpen) {
        toggleFieldGuide(row as HTMLElement);
      } else {
        guideReturnTarget = row as HTMLElement;
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
  if (e.buttons > 0) handleNakayaPointer(e);
});

nakayaCanvas?.addEventListener('keydown', (e: Event) => {
  const { key } = e as KeyboardEvent;
  const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key);
  const isAction = key === ' ' || key === 'Enter';

  if (isArrow || isAction) {
    e.preventDefault();
    e.stopPropagation();

    if (!isLabMode) {
      toggleLabMode();
    }

    if (isArrow) {
      const tStep = 1;
      const ssStep = 5;

      if (key === 'ArrowLeft') labParams.temperature = Math.max(-40, labParams.temperature - tStep);
      if (key === 'ArrowRight') labParams.temperature = Math.min(0, labParams.temperature + tStep);
      if (key === 'ArrowUp') labParams.supersaturation = Math.min(100, labParams.supersaturation + ssStep);
      if (key === 'ArrowDown') labParams.supersaturation = Math.max(0, labParams.supersaturation - ssStep);

      visualPress('nakaya-diagram');
      updateFromPane(true);
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

  // Immediate visual feedback for better perceived performance
  setTemporaryLabel('btn-copy', 'Copied!', '✓', false, true);
  setTemporaryLabel('btn-seed', 'Copied!', '✓', false, true);
  announce(`Link copied for seed ${currentSeedLabel}`);

  // Small delay to ensure UI has time to paint before potentially blocking clipboard operations
  setTimeout(async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error('Clipboard API unavailable');
      }
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
      } catch (fallbackErr) {
        console.error('Legacy fallback failed:', fallbackErr);
        setTemporaryLabel('btn-copy', 'Failed', '✕', true);
        setTemporaryLabel('btn-seed', 'Failed', '✕', true);
        announce('Failed to copy link');
      }
    }
  }, 50);
}

document.getElementById('btn-copy')?.addEventListener('click', copyLink);
document.getElementById('btn-seed')?.addEventListener('click', copyLink);

async function saveSnowflake() {
  setTemporaryLabel('btn-save', 'Saving...', '⌛');
  announce('Saving snowflake as PNG');

  // Delay to ensure UI updates before heavy rendering
  setTimeout(() => {
    try {
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
  if (btnPrism) {
    btnPrism.setAttribute('aria-pressed', enabled.toString());
    btnPrism.classList.toggle('active', enabled);
  }
  scene.setPrismMode(enabled);
  document.body.classList.toggle('prism-mode', enabled);
  announce(`Prism mode ${enabled ? 'enabled' : 'disabled'}`);
}

btnPrism?.addEventListener('click', togglePrismMode);

const btnRotate = document.getElementById('btn-rotate');
if (btnRotate) {
  btnRotate.setAttribute('aria-pressed', scene.isAutoRotateEnabled.toString());
  btnRotate.classList.toggle('active', scene.isAutoRotateEnabled);
}

function toggleAutoRotate() {
  const enabled = !scene.isAutoRotateEnabled;
  if (btnRotate) {
    btnRotate.setAttribute('aria-pressed', enabled.toString());
    btnRotate.classList.toggle('active', enabled);
  }
  scene.setAutoRotate(enabled);
  announce(`Auto-rotation ${enabled ? 'enabled' : 'disabled'}`);
}

btnRotate?.addEventListener('click', toggleAutoRotate);

const btnUI = document.getElementById('btn-ui');

function toggleUI(forceShow?: boolean) {
  isUIHidden = forceShow === undefined ? !isUIHidden : !forceShow;

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
canvas.addEventListener('click', () => {
  if (isUIHidden) toggleUI(true);
});

function resetView() {
  scene.resetView();
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

  const actions: Record<string, () => void> = {
    'arrowup': () => (e.preventDefault(), scene.rotateView(0, -0.1)),
    'arrowdown': () => (e.preventDefault(), scene.rotateView(0, 0.1)),
    'arrowleft': () => (e.preventDefault(), scene.rotateView(-0.1, 0)),
    'arrowright': () => (e.preventDefault(), scene.rotateView(0.1, 0)),
    'r': () => (handleRefresh(), visualPress('refresh')),
    ' ': () => (e.preventDefault(), handleRefresh(), visualPress('refresh')),
    'v': () => (resetView(), visualPress('btn-reset')),
    'g': () => (toggleFieldGuide(), visualPress('guide-toggle')),
    '?': () => (toggleFieldGuide(), visualPress('guide-toggle')),
    'l': () => (toggleLabMode(), visualPress('lab-toggle')),
    'h': () => (toggleUI(), visualPress('btn-ui')),
    'p': () => (togglePinkMode(), visualPress('btn-pink')),
    'm': () => (togglePrismMode(), visualPress('btn-prism')),
    's': () => (saveSnowflake(), visualPress('btn-save')),
    'a': () => (toggleAutoRotate(), visualPress('btn-rotate')),
    'c': () => (copyLink(), visualPress('btn-copy'), visualPress('btn-seed')),
  };
  actions[k]?.();
});

grow();
scene.start();
