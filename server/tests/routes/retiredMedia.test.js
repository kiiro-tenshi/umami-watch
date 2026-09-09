import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import retiredMedia from '../../routes/retiredMedia.js';

afterEach(() => vi.unstubAllGlobals());
describe('retired backend media endpoints', () => {
  it.each(['/api/proxy/hls', '/api/proxy/video', '/api/torrent/stream', '/api/torrent/seed'])('rejects %s without fetching or serving the SPA', async path => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const app = express();
    app.use(['/api/proxy', '/api/torrent'], retiredMedia);
    app.get('*', (_req, res) => res.send('SPA'));
    const response = await request(app).get(path).query({ url: 'https://cdn.example/video.mp4' });
    expect(response.status).toBe(410);
    expect(response.body.code).toBe('MEDIA_PROXY_REMOVED');
    expect(fetch).not.toHaveBeenCalled();
  });
});
