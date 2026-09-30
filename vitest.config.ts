import { defineConfig } from 'vitest/config';

const happyDomSpecs = [
  'tests/unit/scene-reduced-motion.spec.ts',
  'tests/unit/lab-panel.spec.ts',
  'tests/unit/stale-build.spec.ts',
  'tests/unit/postprocessing.spec.ts',
  'tests/unit/lab-mode-load.spec.ts',
  'tests/unit/context-loss.spec.ts',
  'tests/unit/history.spec.ts',
  'tests/unit/mode-prefs.spec.ts',
  'tests/unit/client-error.spec.ts',
  'tests/unit/keyboard.spec.ts',
  'tests/unit/nakaya-announce.spec.ts',
  'tests/unit/export-action.spec.ts',
  'tests/unit/scene-frost-load.spec.ts',
] as const;

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.spec.ts'],
    environment: 'node',
    environmentMatchGlobs: happyDomSpecs.map((spec) => [spec, 'happy-dom']),
  },
});
