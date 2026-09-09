// Vite wires the dev-only editor save endpoint and the tiny initial loading
// script, which must run even when the game's module graph fails to download.
//
// `editorSavePlugin` is DEV ONLY (`apply: 'serve'` inside it), so `vite build`
// keeps the deployed game free of a write endpoint. The loading script is
// included in the HTML in development and production.
//
// docs/mmo/wiring/ED1-EDITOR.md has the endpoint and what it refuses.

import { defineConfig } from 'vite';
import { editorSavePlugin } from './tools/editor_save.mjs';
import { inlineBootScreenPlugin } from './tools/boot_screen.mjs';

export default defineConfig({
  plugins: [editorSavePlugin(process.cwd()), inlineBootScreenPlugin()],
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
