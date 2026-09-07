// Vite's configuration, which exists for one reason: the in game editor needs
// somewhere to save what it lays out.
//
// `editorSavePlugin` is DEV ONLY (`apply: 'serve'` inside it), so `vite build`
// produces exactly what it produced before this file existed and the deployed
// game has no write endpoint. Everything else is Vite's own defaults, which is
// what the project ran on until now.
//
// docs/mmo/wiring/ED1-EDITOR.md has the endpoint and what it refuses.

import { defineConfig } from 'vite';
import { editorSavePlugin } from './tools/editor_save.mjs';

export default defineConfig({
  plugins: [editorSavePlugin(process.cwd())],
  server: {
    port: 5198,
    strictPort: false,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true, changeOrigin: true },
    },
  },
});
