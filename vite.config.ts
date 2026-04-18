import { defineConfig } from 'vite';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  base: '/',
  plugins: [cloudflare()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
    rolldownOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/postprocessing')) return 'postprocessing';
          return undefined;
        },
      },
    },
  },
});
