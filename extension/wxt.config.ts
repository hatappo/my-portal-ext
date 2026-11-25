import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const icons = { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' };

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  imports: false,
  zip: { artifactTemplate: `my-portal-ext-${version}-{{browser}}.zip` },
  manifest: {
    name: 'My Portal Extension',
    version,
    description: 'A Chrome side panel companion for My Portal, with bookmark import.',
    minimum_chrome_version: '116',
    permissions: ['storage'],
    optional_permissions: ['bookmarks'],
    host_permissions: ['https://script.google.com/*', 'https://*.googleusercontent.com/*'],
    icons,
    action: { default_title: 'Open My Portal Extension', default_icon: icons },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; frame-src https: http://localhost:* http://*.localhost:* http://127.0.0.1:*; base-uri 'none'" },
  },
  hooks: {
    'build:publicAssets'(wxt, files) {
      const directory = path.join(wxt.config.wxtDir, 'icons');
      // Run the Node-only artwork generator outside Vite's config bundle.
      execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/build-extension-icons.mjs', import.meta.url)), directory]);
      for (const [size, relativeDest] of Object.entries(icons)) {
        files.push({ absoluteSrc: path.join(directory, size + '.png'), relativeDest });
      }
      files.push({ absoluteSrc: fileURLToPath(new URL('./assets/FONT-LICENSE.txt', import.meta.url)), relativeDest: 'FONT-LICENSE.txt' });
    },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});
