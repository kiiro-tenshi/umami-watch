import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PassThrough } from 'stream';
import { EventEmitter } from 'events';

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockVerifyIdToken = vi.hoisted(() => vi.fn());

// Pre-configured engines keyed by magnet — tests populate this before requests
const enginesByMagnet = new Map();

function makeFakeEngine({ fileName = 'episode.mp4', fileSize = 1024 } = {}) {
  const engine = new EventEmitter();
  engine._ready = false;
  engine.destroy = vi.fn();
  const fileData = Buffer.alloc(fileSize, 0x42);
  engine.files = [
    {
      name: fileName,
      length: fileSize,
      createReadStream: vi.fn((opts) => {
        const pt = new PassThrough();
        const chunk = opts ? fileData.slice(opts.start, (opts.end ?? fileSize - 1) + 1) : fileData;
        process.nextTick(() => pt.end(chunk));
        return pt;
      }),
    },
  ];
  return engine;
}

vi.mock('firebase-admin', () => ({
  default: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
    firestore: Object.assign(() => ({}), { FieldValue: { serverTimestamp: () => '__TS__' } }),
  },
}));

vi.mock('torrent-stream', () => ({
  default: vi.fn((magnet) => {
    // Return a pre-configured engine if the test set one up, otherwise create fresh
    const engine = enginesByMagnet.has(magnet)
      ? enginesByMagnet.get(magnet)
      : makeFakeEngine();

    if (!enginesByMagnet.has(magnet)) enginesByMagnet.set(magnet, engine);

    // ALWAYS fire 'ready' after getOrCreateEngine finishes its synchronous setup
    // (registers on('ready') listener and sets _ready = false). Without this,
    // pre-populated engines never fire the event and the route hangs.
    process.nextTick(() => {
      engine._ready = true;
      engine.emit('ready');
    });

    return engine;
  }),
}));

vi.mock('fluent-ffmpeg', () => ({
  default: vi.fn(() => ({
    inputFormat: vi.fn().mockReturnThis(),
    outputOptions: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    pipe: vi.fn((res) => {
      process.nextTick(() => res.end(Buffer.alloc(16)));
    }),
  })),
}));

// ── App setup ──────────────────────────────────────────────────────────────
const { default: torrentRoutes } = await import('../../routes/torrent.js');

const app = express();
app.use((req, _res, next) => { req.user = { uid: 'test-uid' }; next(); });
app.use('/', torrentRoutes);

const MAGNET_BASE = 'magnet:?xt=urn:btih:';

// ── Tests ──────────────────────────────────────────────────────────────────
describe('GET /api/torrent/status', () => {
  beforeEach(() => { vi.clearAllMocks(); enginesByMagnet.clear(); });

  it('returns known:false for an unknown magnet', async () => {
    const res = await request(app)
      .get('/status?magnet=' + encodeURIComponent(MAGNET_BASE + 'completely-unknown'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ready: false, known: false });
  });

  it('returns known:true after the engine has been used in a stream request', async () => {
    const magnet = MAGNET_BASE + 'status-known-test';
    enginesByMagnet.set(magnet, makeFakeEngine({ fileName: 'show.mp4', fileSize: 512 }));

    // Prime the engine cache via a stream request
    await request(app).get('/stream?magnet=' + encodeURIComponent(magnet));

    const res = await request(app).get('/status?magnet=' + encodeURIComponent(magnet));
    expect(res.status).toBe(200);
    expect(res.body.known).toBe(true);
    expect(res.body.ready).toBe(true);
  });

  it('returns 400 when magnet query param is missing', async () => {
    const res = await request(app).get('/status');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/torrent/stream', () => {
  beforeEach(() => { vi.clearAllMocks(); enginesByMagnet.clear(); });

  it('returns 400 when magnet is missing', async () => {
    const res = await request(app).get('/stream');
    expect(res.status).toBe(400);
  });

  it('returns 200 with video/mp4 content type for an MP4 stream', async () => {
    const magnet = MAGNET_BASE + 'stream-mp4-test';
    enginesByMagnet.set(magnet, makeFakeEngine({ fileName: 'episode.mp4', fileSize: 2048 }));

    const res = await request(app)
      .get('/stream?magnet=' + encodeURIComponent(magnet));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/video\/mp4/);
  }, 10_000);

  it('returns 206 with Content-Range header for range requests on MP4', async () => {
    const magnet = MAGNET_BASE + 'stream-range-test';
    enginesByMagnet.set(magnet, makeFakeEngine({ fileName: 'movie.mp4', fileSize: 4096 }));

    const res = await request(app)
      .get('/stream?magnet=' + encodeURIComponent(magnet))
      .set('Range', 'bytes=0-511');

    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 0-511/4096');
    expect(res.headers['accept-ranges']).toBe('bytes');
  }, 10_000);

  it('selects fileIdx when provided', async () => {
    const magnet = MAGNET_BASE + 'stream-fileidx-test';
    const engine = new EventEmitter();
    engine._ready = false;
    engine.destroy = vi.fn();
    const mainReadStream = vi.fn(() => { const pt = new PassThrough(); process.nextTick(() => pt.end(Buffer.alloc(1024))); return pt; });
    engine.files = [
      { name: 'small.mp4', length: 64, createReadStream: vi.fn(() => { const pt = new PassThrough(); process.nextTick(() => pt.end(Buffer.alloc(64))); return pt; }) },
      { name: 'main.mp4', length: 1024, createReadStream: mainReadStream },
    ];
    enginesByMagnet.set(magnet, engine);

    await request(app)
      .get('/stream?magnet=' + encodeURIComponent(magnet) + '&fileIdx=1');

    expect(mainReadStream).toHaveBeenCalled();
  }, 10_000);
});

describe('GET /api/torrent/seed', () => {
  beforeEach(() => { vi.clearAllMocks(); enginesByMagnet.clear(); });

  it('returns 400 when magnet is missing', async () => {
    const res = await request(app).get('/seed');
    expect(res.status).toBe(400);
  });

  it('returns 200 with application/octet-stream for full download', async () => {
    const magnet = MAGNET_BASE + 'seed-full-test';
    enginesByMagnet.set(magnet, makeFakeEngine({ fileName: 'video.mp4', fileSize: 512 }));

    const res = await request(app)
      .get('/seed?magnet=' + encodeURIComponent(magnet));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/octet-stream/);
    expect(res.headers['accept-ranges']).toBe('bytes');
  }, 10_000);

  it('returns 206 with correct range headers for partial content', async () => {
    const magnet = MAGNET_BASE + 'seed-range-test';
    enginesByMagnet.set(magnet, makeFakeEngine({ fileName: 'anime.mp4', fileSize: 8192 }));

    const res = await request(app)
      .get('/seed?magnet=' + encodeURIComponent(magnet))
      .set('Range', 'bytes=1024-2047');

    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 1024-2047/8192');
    expect(Number(res.headers['content-length'])).toBe(1024);
  }, 10_000);
});
