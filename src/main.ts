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
let currentConditions: GrowthConditions;
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

function grow(manualConditions?: GrowthConditions, keepSeed = false) {
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

  scene.updateFlake(result);
  nakayaDiagram?.update(conditions.path);

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
}

function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

document.getElementById('refresh')?.addEventListener('click', () => {
  window.history.replaceState(null, '', window.location.pathname);
  grow(isLabMode ? currentConditions : undefined);
});

const labToggle = document.getElementById('lab-toggle');
const guideToggle = document.getElementById('guide-toggle');
const labControls = document.getElementById('lab-controls');
const fieldGuide = document.getElementById('field-guide');
const statsDisplay = document.getElementById('stats-display');
const labStatus = document.getElementById('lab-status');

async function toggleLabMode() {
  isLabMode = !isLabMode;

  if (isLabMode && isGuideOpen) {
    toggleFieldGuide();
  }

  if (labToggle) labToggle.setAttribute('aria-pressed', isLabMode.toString());
  if (labControls) labControls.style.display = isLabMode ? 'flex' : 'none';
  if (statsDisplay) statsDisplay.style.display = (isLabMode || isGuideOpen) ? 'none' : 'flex';
  if (labStatus) {
    labStatus.textContent = isLabMode ? 'ON' : 'OFF';
    labStatus.style.color = isLabMode ? 'var(--accent)' : 'var(--ink-dim)';
  }

  if (isLabMode) {
    await ensurePane();
    updateFromPane();
  } else {
    grow(undefined, true);
  }
}

function toggleFieldGuide() {
  isGuideOpen = !isGuideOpen;

  if (isGuideOpen && isLabMode) {
    toggleLabMode();
  }

  if (guideToggle) guideToggle.setAttribute('aria-pressed', isGuideOpen.toString());
  if (fieldGuide) fieldGuide.style.display = isGuideOpen ? 'block' : 'none';
  if (statsDisplay) statsDisplay.style.display = (isLabMode || isGuideOpen) ? 'none' : 'flex';
}

labToggle?.addEventListener('click', toggleLabMode);
guideToggle?.addEventListener('click', toggleFieldGuide);

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

  grow(conditions, true);
}

document.getElementById('btn-copy')?.addEventListener('click', () => {
  const url = `${window.location.origin}${window.location.pathname}?seed=${currentSeedLabel}`;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('btn-copy');
    if (btn) {
      const labelEl = btn.querySelector('.action-btn__label');
      if (labelEl) {
        const originalLabel = labelEl.textContent;
        labelEl.textContent = 'Copied!';
        setTimeout(() => {
          labelEl.textContent = originalLabel;
        }, 2000);
      }
    }
  });
});

function saveSnowflake() {
  scene.composer.render();

  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  const habit = currentConditions.habit.replace(/_/g, '-');
  link.download = `frostbomb-${habit}-${currentSeedLabel}.png`;
  link.href = dataUrl;
  link.click();
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
}

btnPrism?.addEventListener('click', togglePrismMode);

const btnRotate = document.getElementById('btn-rotate');
btnRotate?.addEventListener('click', () => {
  const enabled = !scene.isAutoRotateEnabled;
  if (btnRotate) {
    btnRotate.setAttribute('aria-pressed', enabled.toString());
    btnRotate.classList.toggle('active', enabled);
  }
  scene.setAutoRotate(enabled);
});

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'r') {
    window.history.replaceState(null, '', window.location.pathname);
    grow(isLabMode ? currentConditions : undefined);
  } else if (key === 'l') {
    toggleLabMode();
  } else if (key === 'p') {
    togglePinkMode();
  } else if (key === 'm') {
    togglePrismMode();
  } else if (key === 's') {
    saveSnowflake();
  }
});

grow();
scene.start();
