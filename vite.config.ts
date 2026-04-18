import { defineConfig } from 'vite';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  base: '/',
  plugins: [cloudflare()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
});