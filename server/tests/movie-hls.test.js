import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { extractMoviePlaylist } from '../../cloudflare-worker/hls-proxy.js';

const html = `window.masterPlaylist = {
  params: { 'token': 'test-token', 'expires': '123456', 'asn': '' },
  url: 'https://vixsrc.to/playlist/42',
};`;
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
  it('parses the provider configuration without executing scripts', () => {
    expect(extractMoviePlaylist(html)).toBe('https://vixsrc.to/playlist/42?token=test-token&expires=123456&h=1&ub=1');
    expect(() => extractMoviePlaylist(html.replace('https://vixsrc.to', 'https://untrusted.example'))).toThrow('Unsupported');
  });

  it.each(['/movie/550', '/tv/1399/2/3'])('resolves %s and proxies extensionless playlists, audio and subtitles', async path => {
    const cache = { match: vi.fn(), put: vi.fn() };
    vi.stubGlobal('caches', { default: cache });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ src: '/embed/42?token=abc' }))
      .mockResolvedValueOnce(new Response(html))
      .mockResolvedValueOnce(new Response('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,LANGUAGE="ita",DEFAULT=YES,AUTOSELECT=YES,URI="?type=audio&lang=ita"\n#EXT-X-MEDIA:TYPE=AUDIO,LANGUAGE="eng",DEFAULT=NO,AUTOSELECT=NO,URI="?type=audio&lang=eng"\n#EXT-X-MEDIA:TYPE=SUBTITLES,URI="?type=subtitle"\n#EXT-X-STREAM-INF:BANDWIDTH=1000\n?type=video\n'));
    vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(new Request('https://worker.example/?embed=' + encodeURIComponent('https://vixsrc.to' + path)), {}, { waitUntil: vi.fn() });
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe('https://vixsrc.to/api' + path);
    const text = await response.text();
    expect(text).toContain('LANGUAGE="eng",DEFAULT=YES,AUTOSELECT=YES');
    expect(text).toContain('LANGUAGE="ita",DEFAULT=NO');
    expect(text).toContain('https://worker.example/?url=' + encodeURIComponent('https://vixsrc.to/playlist/42?type=video'));
    expect(text).toContain(encodeURIComponent('https://vixsrc.to/playlist/42?type=subtitle'));
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('rejects an unexpected embed origin before fetching it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ src: 'https://untrusted.example/embed/42' }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(new Request('https://worker.example/?embed=https://vixsrc.to/movie/550'), {}, {});
    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
