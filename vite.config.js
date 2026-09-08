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
  build: {
    rolldownOptions: {
      input: { game: 'index.html', welcome: 'welcome/index.html' },
    },
  },
  server: {
    port: 5198,
    strictPort: false,
    // The editor's saves land in these folders. Vite used to see every one
    // as a source change and reload the page, which threw the builder back to
    // the roster after each placement (2026-09-08). The running game already
    // holds what it placed; the files are for the next load.
    watch: { ignored: ['**/src/mmo/spaces/**', '**/public/terrain/**'] },
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true, changeOrigin: true },
    },
  },
});
