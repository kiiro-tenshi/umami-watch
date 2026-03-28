import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { copyFileSync, existsSync } from 'fs';

function copyWtSw() {
  const src = 'node_modules/webtorrent/webtorrent.sw.js';
  if (existsSync(src)) copyFileSync(src, 'public/webtorrent.sw.js');
}

// Several WebTorrent dependencies ship `{}` as their browser shim. Rollup
// fails at build time when code destructures named exports from those empty
// objects. Replace them with minimal stubs that export the expected names.
function browserShims() {
  const shims = {
    // bittorrent-dht is Node-only; its browser field resolves to {}.
    // torrent-discovery imports `{ Client as DHT }` from it — stub it out.
    'bittorrent-dht': `
      export class Client {
        constructor() {}
        listen() {}
        lookup() {}
        announce() {}
        destroy(cb) { if (cb) cb(); }
        on() { return this; }
        off() { return this; }
        removeListener() { return this; }
        emit() {}
      }
      export default { Client };
    `,
  };

  return {
    name: 'browser-shims',
    resolveId(id) {
      if (Object.prototype.hasOwnProperty.call(shims, id)) return `\0${id}-shim`;
    },
    load(id) {
      if (id.endsWith('-shim')) {
        const name = id.slice(1, -5); // strip leading \0 and trailing -shim
        if (Object.prototype.hasOwnProperty.call(shims, name)) return shims[name];
      }
    },
  };
}

export default defineConfig({
  plugins: [
    browserShims(),
    nodePolyfills({ include: ['events', 'path', 'crypto', 'buffer', 'stream', 'util', 'process'] }),
    react(),
    {
      name: 'copy-webtorrent-sw',
      buildStart() { copyWtSw(); },      // production build
      configureServer() { copyWtSw(); }, // vite dev server
    },
  ],
});
