import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PassThrough } from 'stream';
import { EventEmitter } from 'events';

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockVerifyIdToken = vi.hoisted(() => vi.fn());

// Factory to create a fake torrent engine
function makeFakeEngine({ ready = false, fileName = 'episode.mp4', fileSize = 1024 } = {}) {
  const engine = new EventEmitter();
  engine._ready = ready;
  engine.destroy = vi.fn();

  const fileData = Buffer.alloc(fileSize, 0x42); // fill with 'B'
  engine.files = [
    {
      name: fileName,
      length: fileSize,
      createReadStream: vi.fn((opts) => {
        const pt = new PassThrough();
        const chunk = opts ? fileData.slice(opts.start, opts.end + 1) : fileData;
        process.nextTick(() => pt.end(chunk));
        return pt;
      }),
    },
  ];
  return engine;
}

// Each test gets a fresh engine keyed by a unique magnet
const enginesByMagnet = new Map();

vi.mock('firebase-admin', () => ({
  default: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
    firestore: Object.assign(() => ({}), { FieldValue: { serverTimestamp: () => '__TS__' } }),
  },
}));

vi.mock('torrent-stream', () => ({
  default: vi.fn((magnet) => {
    if (enginesByMagnet.has(magnet)) return enginesByMagnet.get(magnet);
    const engine = makeFakeEngine();
    enginesByMagnet.set(magnet, engine);
    // Fire 'ready' on next tick so the route can register its listener first
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
      const pt = new PassThrough();
      process.nextTick(() => { pt.end(Buffer.alloc(16)); pt.pipe(res); });
      return pt;
    }),
  })),
}));

// ── App setup ──────────────────────────────────────────────────────────────
const { default: torrentRoutes } = await import('../../routes/torrent.js');

// Bypass auth for route unit tests — test auth separately in requireAuth.test.js
const app = express();
app.use((req, _res, next) => { req.user = { uid: 'test-uid' }; next(); });
app.use('/', torrentRoutes);

const MAGNET_BASE = 'magnet:?xt=urn:btih:';

// ── Tests ──────────────────────────────────────────────────────────────────
describe('GET /api/torrent/status', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns known:false for an unknown magnet', async () => {
    const res = await request(app).get('/status?magnet=' + encodeURIComponent(MAGNET_BASE + 'unknown999'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ready: false, known: false });
  });

  it('returns known:true and file list for a known ready engine', async () => {
    const magnet = MAGNET_BASE + 'statustest123';
    const engine = makeFakeEngine({ ready: true, fileName: 'show.mp4', fileSize: 500 });
    enginesByMagnet.set(magnet, engine);
    // Simulate the engine being cached as ready
    const { default: ts } = await import('torrent-stream');
    ts.mockImplementationOnce(() => engine);
    // Trigger a stream request to cache the engine
    await request(app).get('/stream?magnet=' + encodeURIComponent(magnet));

    const res = await request(app).get('/status?magnet=' + encodeURIComponent(magnet));
    expect(res.status).toBe(200);
    expect(res.body.known).toBe(true);
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
    const engine = makeFakeEngine({ fileName: 'episode.mp4', fileSize: 2048 });
    enginesByMagnet.set(magnet, engine);

    const res = await request(app)
      .get('/stream?magnet=' + encodeURIComponent(magnet));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/video\/mp4/);
  });

  it('returns 206 with Content-Range header for range requests on MP4', async () => {
    const magnet = MAGNET_BASE + 'stream-range-test';
    const engine = makeFakeEngine({ fileName: 'movie.mp4', fileSize: 4096 });
    engine._ready = true; // pre-mark as ready
    enginesByMagnet.set(magnet, engine);

    const res = await request(app)
      .get('/stream?magnet=' + encodeURIComponent(magnet))
      .set('Range', 'bytes=0-511');

    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 0-511/4096');
    expect(res.headers['accept-ranges']).toBe('bytes');
  });

  it('selects fileIdx when provided in query param', async () => {
    const magnet = MAGNET_BASE + 'stream-fileidx-test';
    const engine = new EventEmitter();
    engine._ready = true;
    engine.destroy = vi.fn();
    const mockCreateReadStream = vi.fn(() => {
      const pt = new PassThrough();
      process.nextTick(() => pt.end(Buffer.alloc(64)));
      return pt;
    });
    engine.files = [
      { name: 'small.mp4', length: 64, createReadStream: vi.fn(() => { const pt = new PassThrough(); process.nextTick(() => pt.end()); return pt; }) },
      { name: 'main.mp4', length: 1024, createReadStream: mockCreateReadStream },
    ];
    enginesByMagnet.set(magnet, engine);

    await request(app)
      .get('/stream?magnet=' + encodeURIComponent(magnet) + '&fileIdx=1');

    expect(mockCreateReadStream).toHaveBeenCalled();
  });
});

describe('GET /api/torrent/seed', () => {
  beforeEach(() => { vi.clearAllMocks(); enginesByMagnet.clear(); });

  it('returns 400 when magnet is missing', async () => {
    const res = await request(app).get('/seed');
    expect(res.status).toBe(400);
  });

  it('returns 200 with application/octet-stream for full download', async () => {
    const magnet = MAGNET_BASE + 'seed-full-test';
    const engine = makeFakeEngine({ fileName: 'video.mp4', fileSize: 512 });
    engine._ready = true;
    enginesByMagnet.set(magnet, engine);

    const res = await request(app)
      .get('/seed?magnet=' + encodeURIComponent(magnet));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/octet-stream/);
    expect(res.headers['accept-ranges']).toBe('bytes');
  });

  it('returns 206 with correct range headers for partial content', async () => {
    const magnet = MAGNET_BASE + 'seed-range-test';
    const engine = makeFakeEngine({ fileName: 'anime.mp4', fileSize: 8192 });
    engine._ready = true;
    enginesByMagnet.set(magnet, engine);

    const res = await request(app)
      .get('/seed?magnet=' + encodeURIComponent(magnet))
      .set('Range', 'bytes=1024-2047');

    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 1024-2047/8192');
    expect(Number(res.headers['content-length'])).toBe(1024);
  });
});
