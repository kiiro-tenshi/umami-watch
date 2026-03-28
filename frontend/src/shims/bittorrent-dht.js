// Browser stub for bittorrent-dht (Node-only package).
// torrent-discovery imports `{ Client as DHT }` from it; this satisfies that import.
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
