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

let isLabMode = false;
let isGuideOpen = false;
let isUIHidden = false;
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
    canvas.setAttribute('aria-label', `3D procedural snowflake visualization: a ${habitLabel[conditions.habit]} (Seed: ${label})`);
  }

  document.title = `${habitLabel[conditions.habit]} — frostbomb`;
  const btnSeed = document.getElementById('btn-seed');
  if (btnSeed) {
    btnSeed.setAttribute('aria-label', `Copy share link for seed ${label}`);
  }

  const tempF = (conditions.temperatureC * 9 / 5) + 32;
  setText('seed-display', label);
  setText('stat-temp', `${conditions.temperatureC.toFixed(1)} °C / ${tempF.toFixed(1)} °F`);
  setText('stat-humid', `${(conditions.supersaturation * 100).toFixed(0)}%`);

  const habitText = habitLabel[conditions.habit];
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

  // Always sync labParams so Lab Mode starts from the current snowflake's conditions
  labParams.habit = habitLabel[conditions.habit];
  labParams.temperature = conditions.temperatureC;
  labParams.temperatureF = (conditions.temperatureC * 9 / 5) + 32;
  labParams.supersaturation = conditions.supersaturation * 100;
  pane?.refresh();
}

function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
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
    announcer.textContent = message;
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

function toggleFieldGuide() {
  isGuideOpen = !isGuideOpen;

  if (guideToggle) {
    guideToggle.setAttribute('aria-pressed', isGuideOpen.toString());
    guideToggle.setAttribute('aria-expanded', isGuideOpen.toString());
  }
  if (fieldGuide) {
    fieldGuide.style.display = isGuideOpen ? 'block' : 'none';
    if (isGuideOpen) {
      fieldGuide.scrollTop = 0;
      fieldGuide.focus();
    } else if (guideToggle) {
      guideToggle.focus();
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
    };
    const targetId = targets[label || ''];

    if (targetId) {
      if (!isGuideOpen) toggleFieldGuide();
      requestAnimationFrame(() => {
        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  if (nakayaCanvas) {
    nakayaCanvas.setAttribute('aria-label', `Nakaya morphology diagram: ${t.toFixed(1)}°C, ${labParams.supersaturation.toFixed(0)}% humidity. Resulting habit: ${habitLabel[habit]}. Use arrow keys to adjust.`);
  }

  if (shouldAnnounce) {
    announce(`Temperature: ${t.toFixed(1)}°C, Humidity: ${labParams.supersaturation.toFixed(0)}%: ${habitLabel[habit]}`);
  }

  const conditions: GrowthConditions = {
    temperatureC: t,
    supersaturation: ss,
    habit: getHabit(t, ss),
    path: [{ temp: t, ss: ss }], // Manual path is just the point
  };
  labParams.habit = habitLabel[conditions.habit];
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

function toggleUI(forceShow?: boolean) {
  isUIHidden = forceShow === undefined ? !isUIHidden : !forceShow;

  const uiElements = document.querySelectorAll('.masthead, .field-notes, .footer, .lab-controls');
  uiElements.forEach((el) => el.classList.toggle('ui-hidden', isUIHidden));

  if (isUIHidden) {
    announce('UI hidden. Press H or Esc to show.');
  } else {
    announce('UI visible');
  }
}

function resetView() {
  scene.resetView();
  announce('View reset to center');
}

document.getElementById('btn-reset')?.addEventListener('click', resetView);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

window.addEventListener('keydown', (e: Event) => {
  const k = (e as KeyboardEvent).key.toLowerCase();
  if (k === 'escape') {
    if (isGuideOpen) {
      toggleFieldGuide();
      return;
    } else if (isLabMode) {
      toggleLabMode();
      return;
    } else if (isUIHidden) {
      toggleUI(true);
      return;
    }
  }

  const ke = e as KeyboardEvent;
  if (isEditableTarget(e.target) || ke.metaKey || ke.ctrlKey || ke.altKey) return;

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
    'h': () => toggleUI(),
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
