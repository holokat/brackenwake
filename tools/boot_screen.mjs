import { readFileSync } from 'node:fs';

const marker = '<!-- brackenwake:boot-screen -->';
const source = new URL('../src/game/ui/boot-screen.js', import.meta.url);

/** Keep the watchdog independent of module downloads without another request. */
export function inlineBootScreenPlugin() {
  return {
    name: 'brackenwake-boot-screen',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!html.includes(marker)) return html;
        const script = readFileSync(source, 'utf8').replace(/<\/script/gi, '<\\/script');
        return html.replace(marker, () => `<script>${script}</script>`);
      },
    },
  };
}
