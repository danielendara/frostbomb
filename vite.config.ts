import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  plugins: [],
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
});