// Browser stub for bittorrent-dht (Node-only package).
// torrent-discovery imports `{ Client as DHT }` from it and calls EventEmitter
// methods (on, once, off, removeListener, emit) plus DHT-specific methods
// (listen, lookup, announce, destroy). Extending EventEmitter covers all of them.
import { EventEmitter } from 'events';

export class Client extends EventEmitter {
  constructor() { super(); }
  listen() {}
  lookup() {}
  announce() {}
  destroy(cb) { if (cb) cb(); }
}
export default { Client };
