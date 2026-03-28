import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { copyFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function copyWtSw() {
  const src = 'node_modules/webtorrent/webtorrent.sw.js';
  if (existsSync(src)) copyFileSync(src, 'public/webtorrent.sw.js');
}

export default defineConfig({
  resolve: {
    alias: {
      // bittorrent-dht ships `{}` as its browser shim; torrent-discovery
      // imports `{ Client as DHT }` from it which breaks the Rollup build.
      // Point to our stub that exports the expected Client class.
      'bittorrent-dht': resolve(__dirname, 'src/shims/bittorrent-dht.js'),
    },
  },
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
