import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'tests/**',
      'scripts/**',
      '*.config.ts',
      'eslint.config.js',
      'src/main.ts',
      'src/snowflake/scene.ts',
      'src/snowflake/webgl-fallback.ts',
      'src/style.css',
      'src/ui/lab-panel.ts',
      'src/ui/mode-toggle.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'preserve-caught-error': 'off',
    },
  },
);
