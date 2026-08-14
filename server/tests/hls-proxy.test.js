import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { extractHlsFromEmbedHtml, unpackPacker } from '../../cloudflare-worker/hls-proxy.js';

const PACKER = "eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0={\"1\":\"2\"}',3,3,'links|hls4|/stream/token/master.m3u8'.split('|')))";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Cloudflare HLS embed resolver', () => {
  it('unpacks provider player configuration without evaluating it', () => {
    expect(unpackPacker(PACKER)).toBe('links={"hls4":"/stream/token/master.m3u8"}');
    expect(extractHlsFromEmbedHtml(PACKER, 'https://otakuhg.site/e/abc')).toBe(
      'https://otakuhg.site/stream/token/master.m3u8'
    );
  });

  it('extracts a direct manifest from a vibeplayer embed', () => {
    const html = '<script>const src = "https://vivibebe.site/public/stream/abc/master.m3u8";</script>';
    expect(extractHlsFromEmbedHtml(html, 'https://vivibebe.site/abc')).toBe(
      'https://vivibebe.site/public/stream/abc/master.m3u8'
    );
  });

  it('resolves the embed and rewrites its manifest entirely at Cloudflare', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        '<script>const src = "https://vivibebe.site/public/stream/abc/master.m3u8";</script>',
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      ))
      .mockResolvedValueOnce(new Response(
        '#EXTM3U\n#EXTINF:10,\nsegment.ts\n',
        { status: 200, headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } }
      ));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('caches', {
      default: { match: vi.fn(), put: vi.fn() },
    });

    const request = new Request(
      'https://worker.example/?embed=' +
      encodeURIComponent('https://vivibebe.site/abc') +
      '&referer=' +
      encodeURIComponent('https://anineko.to/')
    );
    const response = await worker.fetch(request, {}, { waitUntil: vi.fn() });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://vivibebe.site/abc',
      expect.objectContaining({ headers: expect.objectContaining({ Referer: 'https://anineko.to/' }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://vivibebe.site/public/stream/abc/master.m3u8',
      expect.objectContaining({ headers: expect.objectContaining({ Referer: 'https://vivibebe.site/' }) })
    );
    expect(body).toContain(
      'https://worker.example/?url=https%3A%2F%2Fvivibebe.site%2Fpublic%2Fstream%2Fabc%2Fsegment.ts'
    );
  });

  it('rejects unsupported embed hosts', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const request = new Request(
      'https://worker.example/?embed=' + encodeURIComponent('https://example.com/embed/abc')
    );
    const response = await worker.fetch(request, {}, { waitUntil: vi.fn() });

    expect(response.status).toBe(502);
    expect(await response.text()).toBe('Unsupported embed host');
    expect(fetch).not.toHaveBeenCalled();
  });
});
