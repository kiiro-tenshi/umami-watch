import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../../cloudflare-worker/hls-proxy.js';

afterEach(() => vi.unstubAllGlobals());

describe('movie HLS at the Worker', () => {
  it('streams mislabeled encrypted audio without losing prefix or trailing bytes', async () => {
    const prefix = new Uint8Array(600).fill(154);
    const tail = new Uint8Array([0, 1, 2, 255]);
    const body = new ReadableStream({ start(c) { c.enqueue(prefix); c.enqueue(tail); c.close(); } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'text/html' } })));
    vi.stubGlobal('caches', { default: { match: vi.fn(), put: vi.fn() } });
    const response = await worker.fetch(new Request('https://worker.example/?url=https://cdn.example/hls/audio/0001.html'), {}, { waitUntil: vi.fn() });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([...prefix, ...tail]));
  });

  it.each(['<!DOCTYPE html><html>Blocked</html>', '<html>Accès refusé</html>', 'Access denied'])('still rejects an actual block response: %s', async body => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'text/html' } })));
    const cache = { match: vi.fn(), put: vi.fn() };
    vi.stubGlobal('caches', { default: cache });
    const response = await worker.fetch(new Request('https://worker.example/?url=https://cdn.example/hls/audio/0001.html'), {}, { waitUntil: vi.fn() });
    expect(response.status).toBe(530);
    expect(cache.put).not.toHaveBeenCalled();
  });
  it.each(['/movie/550', '/tv/108978/1/1'])('resolves %s with VidZee and rewrites every media URI', async path => {
    vi.stubGlobal('caches', { default: { match: vi.fn(), put: vi.fn() } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ url: 'https://cdn.example/movie/index.m3u8', headers: {} }))
      .mockResolvedValueOnce(new Response('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:10,\nsegment.ts\n'));
    vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(new Request('https://worker.example/?embed=' + encodeURIComponent('https://player.vidzee.wtf' + path)), {}, { waitUntil: vi.fn() });
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe('https://core.vidzee.wtf/streams' + path + '?s=dcloud&e=0');
    expect(fetchMock.mock.calls[1][1].headers.Referer).toBe('https://player.vidzee.wtf/');
    const text = await response.text();
    expect(text).toContain('https://worker.example/?url=' + encodeURIComponent('https://cdn.example/movie/segment.ts'));
    expect(text).toContain(encodeURIComponent('https://cdn.example/movie/key.bin'));
  });

  it.each([
    {}, { c: 'encrypted-result' }, { url: 'http://cdn.example/master.m3u8' },
    { url: 'https://cdn.example/player.html' },
    { url: 'https://cdn.example/master.m3u8', headers: { Authorization: 'unsupported' } },
  ])('rejects unusable provider responses without fetching media', async data => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(data));
    vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(new Request('https://worker.example/?embed=https://player.vidzee.wtf/movie/550'), {}, {});
    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('probes the resolver, manifest, and media segment from the Worker', async () => {
    vi.stubGlobal('caches', { default: { match: vi.fn(), put: vi.fn() } });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ url: 'https://cdn.example/index.m3u8' }))
      .mockResolvedValueOnce(new Response('#EXTM3U\n#EXTINF:10,\nsegment.ts\n'))
      .mockResolvedValueOnce(new Response(new Uint8Array([0x47, 0, 0, 0]), { headers: { 'content-type': 'video/mp2t' } })));
    const response = await worker.fetch(new Request('https://worker.example/?embed=https://player.vidzee.wtf/tv/108978/1/1&probe=1'), {}, { waitUntil: vi.fn() });
    expect(await response.json()).toEqual({ available: true });
  });
});
