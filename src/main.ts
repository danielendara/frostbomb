import './style.css';
import { createScene } from './snowflake/scene.ts';
import { buildSnowflake } from './snowflake/geometry.ts';
import { sampleConditions, habitLabel, getHabit, GrowthConditions } from './snowflake/nakaya.ts';
import { mulberry32, resolveSeed, Rand } from './snowflake/random.ts';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = createScene(canvas);

let isLabMode = false;
let currentConditions: GrowthConditions;
let currentSeedLabel: string;
let currentSeed: { seed: number; label: string } | null = null;

function grow(manualConditions?: GrowthConditions, keepSeed = false) {
  // Clear previous flake
  while (scene.flakeHolder.children.length) {
    const child = scene.flakeHolder.children[0];
    scene.flakeHolder.remove(child);
    if ((child as any).geometry) (child as any).geometry.dispose?.();
  }

  if (!keepSeed || !currentSeed) {
    currentSeed = resolveSeed();
  }

  const { seed, label } = currentSeed;
  currentSeedLabel = label;
  const rng = mulberry32(seed);
  const rand = new Rand(rng);

  const conditions = manualConditions || sampleConditions(rand);
  currentConditions = conditions;
  const { group, branchCount } = buildSnowflake(conditions, rand);
  scene.flakeHolder.add(group);

  // Update UI
  setText('seed-display', label);
  setText(
    'stat-temp',
    `${conditions.temperatureC.toFixed(1)} °C`,
  );
  setText(
    'stat-humid',
    `${(conditions.supersaturation * 100).toFixed(0)}%`,
  );
  setText('stat-habit', habitLabel[conditions.habit]);
  setText('stat-branches', `${branchCount}`);

  if (isLabMode) {
    setText('lab-habit', habitLabel[conditions.habit]);
  }
}

function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// Refresh button — rerolls (removes ?seed= from URL so a new one is picked)
document.getElementById('refresh')?.addEventListener('click', () => {
  window.history.replaceState(null, '', window.location.pathname);
  grow(isLabMode ? currentConditions : undefined);
});

// Keyboard: press `R` to regrow
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    window.history.replaceState(null, '', window.location.pathname);
    grow(isLabMode ? currentConditions : undefined);
  }
});

// Lab Mode Toggle
const labToggle = document.getElementById('lab-toggle');
const labControls = document.getElementById('lab-controls');
const statsDisplay = document.getElementById('stats-display');
const labStatus = document.getElementById('lab-status');

labToggle?.addEventListener('click', () => {
  isLabMode = !isLabMode;
  if (labControls) labControls.style.display = isLabMode ? 'flex' : 'none';
  if (statsDisplay) statsDisplay.style.display = isLabMode ? 'none' : 'flex';
  if (labStatus) {
    labStatus.textContent = isLabMode ? 'ON' : 'OFF';
    labStatus.style.color = isLabMode ? 'var(--accent)' : 'var(--ink-dim)';
  }

  if (isLabMode) {
    updateFromSliders();
  } else {
    // Return to auto mode, but keep current seed
    grow(undefined, true);
  }
});

// Sliders
const sliderTemp = document.getElementById('slider-temp') as HTMLInputElement;
const sliderSS = document.getElementById('slider-ss') as HTMLInputElement;

function updateFromSliders() {
  const t = parseFloat(sliderTemp.value);
  const ss = parseFloat(sliderSS.value) / 100;

  setText('val-temp', t.toFixed(1));
  setText('val-ss', (ss * 100).toFixed(0));

  const conditions: GrowthConditions = {
    temperatureC: t,
    supersaturation: ss,
    habit: getHabit(t, ss)
  };

  grow(conditions, true);
}

sliderTemp?.addEventListener('input', updateFromSliders);
sliderSS?.addEventListener('input', updateFromSliders);

// Share & Save
document.getElementById('btn-copy')?.addEventListener('click', () => {
  const url = `${window.location.origin}${window.location.pathname}?seed=${currentSeedLabel}`;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('btn-copy');
    if (btn) {
      const originalLabel = btn.querySelector('.action-btn__label')!.textContent;
      btn.querySelector('.action-btn__label')!.textContent = 'Copied!';
      setTimeout(() => {
        btn.querySelector('.action-btn__label')!.textContent = originalLabel;
      }, 2000);
    }
  });
});

document.getElementById('btn-save')?.addEventListener('click', () => {
  // To capture the canvas, we need to render one frame immediately
  scene.renderer.render(scene.scene, scene.camera);
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `frostbomb-${currentSeedLabel}.png`;
  link.href = dataUrl;
  link.click();
});

grow();
scene.start();
