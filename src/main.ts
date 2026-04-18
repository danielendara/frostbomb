import './style.css';
import { createScene } from './snowflake/scene.ts';
import { buildSnowflake } from './snowflake/geometry.ts';
import { sampleConditions, habitLabel } from './snowflake/nakaya.ts';
import { mulberry32, resolveSeed, Rand } from './snowflake/random.ts';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = createScene(canvas);

function grow() {
  // Clear previous flake
  while (scene.flakeHolder.children.length) {
    const child = scene.flakeHolder.children[0];
    scene.flakeHolder.remove(child);
    if ((child as any).geometry) (child as any).geometry.dispose?.();
  }

  const { seed, label } = resolveSeed();
  const rng = mulberry32(seed);
  const rand = new Rand(rng);

  const conditions = sampleConditions(rand);
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
}

function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// Refresh button — rerolls (removes ?seed= from URL so a new one is picked)
document.getElementById('refresh')?.addEventListener('click', () => {
  window.history.replaceState(null, '', window.location.pathname);
  grow();
});

// Keyboard: press `R` to regrow
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    window.history.replaceState(null, '', window.location.pathname);
    grow();
  }
});

grow();
scene.start();
