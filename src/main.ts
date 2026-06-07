import './style.css';
import { createScene } from './snowflake/scene.ts';
import { buildSnowflake } from './snowflake/geometry.ts';
import { sampleConditions, habitLabel, getHabit, GrowthConditions } from './snowflake/nakaya.ts';
import { mulberry32, resolveSeed, Rand } from './snowflake/random.ts';
import { initNakayaDiagram } from './snowflake/diagram.ts';
import { createOneTimeMark, measurePerformance } from './performance.ts';

type TweakpanePane = import('tweakpane').Pane;

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = measurePerformance('scene-create', () => createScene(canvas));

const nakayaCanvas = document.getElementById('nakaya-diagram') as HTMLCanvasElement;
const nakayaDiagram = initNakayaDiagram(nakayaCanvas);

let isLabMode = false;
let isGuideOpen = false;
let lastActiveElement: HTMLElement | null = null;
let currentConditions: GrowthConditions;
let currentSeedLabel: string;
let currentSeed: { seed: number; label: string } | null = null;
const markFirstFlakeBuilt = createOneTimeMark('first-flake-built');

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
  markFirstFlakeBuilt();

  scene.updateFlake(result, animate);
  nakayaDiagram?.update(conditions.path);

  // Update canvas ARIA labels for screen readers
  if (canvas) {
    canvas.setAttribute('aria-label', `3D procedural snowflake visualization of a ${habitLabel[conditions.habit]} (seed ${label})`);
  }
  if (nakayaCanvas) {
    nakayaCanvas.setAttribute('aria-label', `Nakaya morphology diagram showing atmospheric growth path for a ${habitLabel[conditions.habit]}`);
  }

  const tempF = (conditions.temperatureC * 9 / 5) + 32;
  setText('seed-display', label);
  setText('stat-temp', `${conditions.temperatureC.toFixed(1)} °C / ${tempF.toFixed(1)} °F`);
  setText('stat-humid', `${(conditions.supersaturation * 100).toFixed(0)}%`);
  setText('stat-habit', habitLabel[conditions.habit]);
  setText('stat-branches', `${result.branchCount}`);

  if (isLabMode) {
    labParams.habit = habitLabel[conditions.habit];
    labParams.temperature = conditions.temperatureC;
    labParams.temperatureF = (conditions.temperatureC * 9 / 5) + 32;
    labParams.supersaturation = conditions.supersaturation * 100;
    pane?.refresh();
  }

  if (animate) {
    announce(`New snowflake grown: a ${habitLabel[conditions.habit]} at ${conditions.temperatureC.toFixed(1)}°C (${tempF.toFixed(1)}°F) and ${(conditions.supersaturation * 100).toFixed(0)}% humidity.`);
  }
}

function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (!el) return;

  // If a temporary label is currently being shown for this element (or its parent button),
  // update the stored original value instead of the live text so it restores correctly.
  const parentBtn = el.closest('button');
  const trackedId = (parentBtn && originalLabels.has(parentBtn.id)) ? parentBtn.id : (originalLabels.has(id) ? id : null);

  if (trackedId) {
    originalLabels.set(trackedId, value);
    return;
  }

  el.textContent = value;
}

function announce(message: string) {
  const announcer = document.getElementById('a11y-announcer');
  if (announcer) {
    // Clear and reset to ensure screen readers announce identical successive messages.
    // Some screen readers need a small delay or a text change to trigger an announcement
    // if the region already contains the same text.
    announcer.textContent = '';
    announcer.setAttribute('aria-hidden', 'true');

    setTimeout(() => {
      announcer.removeAttribute('aria-hidden');
      announcer.textContent = message;
    }, 50);
  }
}

const originalLabels = new Map<string, string>();
const originalIcons = new Map<string, string>();
const labelTimeouts = new Map<string, number>();

/**
 * Sets a temporary label and optionally an icon for a button, handling restoration robustly.
 */
function setTemporaryLabel(btnId: string, tempText: string, duration = 2000, tempIcon?: string) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  const labelEl = btn.querySelector('.action-btn__label') || btn.querySelector('#seed-display') || btn;
  const iconEl = btn.querySelector('.action-btn__icon') || btn.querySelector('.refresh__icon');

  if (!labelEl) return;

  // Clear existing timeout if any
  if (labelTimeouts.has(btnId)) {
    window.clearTimeout(labelTimeouts.get(btnId));
  }

  // Capture original state only once
  if (!originalLabels.has(btnId)) {
    originalLabels.set(btnId, labelEl.textContent || '');
  }
  if (iconEl && !originalIcons.has(btnId)) {
    originalIcons.set(btnId, iconEl.textContent || '');
  }

  labelEl.textContent = tempText;
  if (iconEl && tempIcon) {
    iconEl.textContent = tempIcon;
  }

  const timeout = window.setTimeout(() => {
    labelEl.textContent = originalLabels.get(btnId) || '';
    originalLabels.delete(btnId);

    if (iconEl && originalIcons.has(btnId)) {
      iconEl.textContent = originalIcons.get(btnId) || '';
      originalIcons.delete(btnId);
    }
    labelTimeouts.delete(btnId);
  }, duration);

  labelTimeouts.set(btnId, timeout);
}

function handleRefresh(e?: Event) {
  if (e instanceof MouseEvent && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
    return;
  }
  if (e) e.preventDefault();

  const refreshBtn = document.getElementById('refresh');
  if (refreshBtn) {
    refreshBtn.classList.remove('refresh--spinning');
    void refreshBtn.offsetWidth; // Trigger reflow
    refreshBtn.classList.add('refresh--spinning');
    setTimeout(() => refreshBtn.classList.remove('refresh--spinning'), 600);
  }

  const dots = document.querySelectorAll('.wordmark__dot');
  dots.forEach(dot => {
    dot.classList.remove('wordmark__dot--spinning');
    void (dot as HTMLElement).offsetWidth; // Trigger reflow
    dot.classList.add('wordmark__dot--spinning');
    setTimeout(() => dot.classList.remove('wordmark__dot--spinning'), 600);
  });

  window.history.replaceState(null, '', window.location.pathname);
  grow(isLabMode ? currentConditions : undefined);
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

  if (isLabMode) {
    lastActiveElement = document.activeElement as HTMLElement;
    if (isGuideOpen) toggleFieldGuide();
  }

  if (labToggle) labToggle.setAttribute('aria-expanded', isLabMode.toString());
  if (labControls) labControls.style.display = isLabMode ? 'flex' : 'none';
  if (statsDisplay) statsDisplay.style.display = (isLabMode || isGuideOpen) ? 'none' : 'flex';
  if (labStatus) {
    labStatus.textContent = isLabMode ? 'ON' : 'OFF';
    labStatus.style.color = isLabMode ? 'var(--accent)' : 'var(--ink-dim)';
  }

  if (isLabMode) {
    await ensurePane();
    if (!isLabMode || toggleGeneration !== labToggleGeneration) return;
    updateFromPane();
    // Focus the first input in the pane
    const firstInput = labControls?.querySelector('input, select, button');
    if (firstInput instanceof HTMLElement) firstInput.focus();
  } else {
    grow(undefined, true);
    if (lastActiveElement) {
      lastActiveElement.focus();
      lastActiveElement = null;
    }
  }
}

function toggleFieldGuide() {
  isGuideOpen = !isGuideOpen;

  if (isGuideOpen) {
    lastActiveElement = document.activeElement as HTMLElement;
    if (isLabMode) toggleLabMode();
  }

  if (guideToggle) guideToggle.setAttribute('aria-expanded', isGuideOpen.toString());
  if (fieldGuide) fieldGuide.style.display = isGuideOpen ? 'block' : 'none';
  if (statsDisplay) statsDisplay.style.display = (isLabMode || isGuideOpen) ? 'none' : 'flex';

  if (isGuideOpen) {
    fieldGuide?.focus();
  } else if (lastActiveElement) {
    lastActiveElement.focus();
    lastActiveElement = null;
  }
}

labToggle?.addEventListener('click', toggleLabMode);
document.getElementById('lab-close')?.addEventListener('click', toggleLabMode);
guideToggle?.addEventListener('click', toggleFieldGuide);
document.getElementById('guide-close')?.addEventListener('click', toggleFieldGuide);

function updateFromPane() {
  const t = labParams.temperature;
  const ss = labParams.supersaturation / 100;

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

/**
 * Robustly copies text to clipboard with fallbacks.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  // 1. Try Navigator API
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.warn('Navigator clipboard failed, trying fallback', e);
    }
  }

  // 2. Try execCommand fallback
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) return true;
  } catch (e) {
    console.warn('execCommand copy failed', e);
  }

  // 3. Last resort: prompt the user to copy manually
  const result = window.prompt('Copy this link:', text);
  return result !== null;
}

async function copyLink() {
  const url = `${window.location.origin}${window.location.pathname}?seed=${currentSeedLabel}`;
  const success = await copyToClipboard(url);

  if (success) {
    setTemporaryLabel('btn-copy', 'Copied!', 2000, '✓');
    setTemporaryLabel('btn-seed', 'Copied!');
    announce(`Link for ${habitLabel[currentConditions.habit]} (seed ${currentSeedLabel}) copied to clipboard`);
  } else {
    announce('Failed to copy link');
  }
}

document.getElementById('btn-copy')?.addEventListener('click', copyLink);
document.getElementById('btn-seed')?.addEventListener('click', copyLink);

function triggerShutter() {
  const shutter = document.getElementById('shutter');
  if (!shutter) return;
  shutter.classList.remove('shutter--active');
  void shutter.offsetWidth; // Trigger reflow
  shutter.classList.add('shutter--active');
}

function saveSnowflake() {
  scene.composer.render();

  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  const habit = currentConditions.habit.replace(/_/g, '-');
  link.download = `frostbomb-${habit}-${currentSeedLabel}.png`;
  link.href = dataUrl;
  link.click();

  triggerShutter();
  setTemporaryLabel('btn-save', 'Saved!', 2000, '✓');
  announce('Snowflake saved as PNG');
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
  announce(enabled ? 'Pink mode enabled' : 'Pink mode disabled');
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
  announce(enabled ? 'Prism mode enabled' : 'Prism mode disabled');
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
  announce(enabled ? 'Auto-rotation enabled' : 'Auto-rotation disabled');
}

btnRotate?.addEventListener('click', toggleAutoRotate);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();

  if (key === 'escape') {
    if (isGuideOpen) {
      toggleFieldGuide();
      return;
    }
    if (isLabMode) {
      toggleLabMode();
      return;
    }
  }

  if (isEditableTarget(e.target)) return;

  if (key === 'r') {
    handleRefresh();
  } else if (key === 'g' || key === '?') {
    toggleFieldGuide();
  } else if (key === 'l') {
    toggleLabMode();
  } else if (key === 'p') {
    togglePinkMode();
  } else if (key === 'm') {
    togglePrismMode();
  } else if (key === 's') {
    saveSnowflake();
  } else if (key === 'a') {
    toggleAutoRotate();
  } else if (key === 'c') {
    copyLink();
  }
});

grow();
scene.start();
