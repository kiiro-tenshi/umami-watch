import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { copyFileSync, existsSync } from 'fs';

function copyWtSw() {
  const src = 'node_modules/webtorrent/webtorrent.sw.js';
  if (existsSync(src)) copyFileSync(src, 'public/webtorrent.sw.js');
}

export default defineConfig({
  plugins: [
    nodePolyfills({ include: ['events', 'path', 'crypto', 'buffer', 'stream', 'util', 'process'] }),
    react(),
    {
      name: 'copy-webtorrent-sw',
      buildStart() { copyWtSw(); },      // production build
      configureServer() { copyWtSw(); }, // vite dev server
    },
  ],
});
