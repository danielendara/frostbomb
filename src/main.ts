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
  setText('stat-branches', `${result.branchCount}`);

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

// Lab Mode Toggle
const labToggle = document.getElementById('lab-toggle');
const labControls = document.getElementById('lab-controls');
const statsDisplay = document.getElementById('stats-display');
const labStatus = document.getElementById('lab-status');

function toggleLabMode() {
  isLabMode = !isLabMode;
  if (labToggle) labToggle.setAttribute('aria-pressed', isLabMode.toString());
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
}

labToggle?.addEventListener('click', toggleLabMode);

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
  // To capture the canvas, we need to render the current frame
  // If bloom is on, we use the composer, otherwise the renderer
  if (scene.composer && scene.isBloomEnabled) {
    scene.composer.render();
  } else {
    scene.renderer.render(scene.scene, scene.camera);
  }

  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  const habit = currentConditions.habit.replace(/_/g, '-');
  link.download = `frostbomb-${habit}-${currentSeedLabel}.png`;
  link.href = dataUrl;
  link.click();
}

document.getElementById('btn-save')?.addEventListener('click', saveSnowflake);

// Bloom Toggle
const btnBloom = document.getElementById('btn-bloom');

function toggleBloom() {
  const enabled = !scene.isBloomEnabled;
  if (btnBloom) {
    btnBloom.setAttribute('aria-pressed', enabled.toString());
    btnBloom.classList.toggle('active', enabled);
  }
  scene.setBloom(enabled);
}

btnBloom?.addEventListener('click', toggleBloom);

// Rotation Toggle
const btnRotate = document.getElementById('btn-rotate');
btnRotate?.addEventListener('click', () => {
  const enabled = !scene.isAutoRotateEnabled;
  if (btnRotate) {
    btnRotate.setAttribute('aria-pressed', enabled.toString());
    btnRotate.classList.toggle('active', enabled);
  }
  scene.setAutoRotate(enabled);
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'r') {
    window.history.replaceState(null, '', window.location.pathname);
    grow(isLabMode ? currentConditions : undefined);
  } else if (key === 'l') {
    toggleLabMode();
  } else if (key === 'b') {
    toggleBloom();
  } else if (key === 's') {
    saveSnowflake();
  }
});

grow();
scene.start();
