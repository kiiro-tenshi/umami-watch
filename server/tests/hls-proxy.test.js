import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { extractHlsFromEmbedHtml, unpackPacker } from '../../cloudflare-worker/hls-proxy.js';

const PACKER = "eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0={\"1\":\"2\"}',3,3,'links|hls4|/stream/token/master.m3u8'.split('|')))";

function stubEdgeCache(cachedResponse) {
  const cache = {
    match: vi.fn().mockResolvedValue(cachedResponse),
    put: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal('caches', { default: cache });
  return cache;
}

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

  it('probes a manifest and media segment entirely at Cloudflare', async () => {
    const cache = stubEdgeCache();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        '<script>const src = "https://otakuvid.online/hls/master.m3u8";</script>',
        { headers: { 'Content-Type': 'text/html' } }
      ))
      .mockResolvedValueOnce(new Response(
        '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\n720p.m3u8\n',
        { headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } }
      ))
      .mockResolvedValueOnce(new Response(
        '#EXTM3U\n#EXTINF:10,\nsegment-1.ts\n',
        { headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } }
      ))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
        status: 206,
        headers: { 'Content-Type': 'video/mp2t' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request(
      'https://worker.example/?probe=1&embed=' +
      encodeURIComponent('https://otakuvid.online/embed/grand-blue')
    );
    const response = await worker.fetch(request, {}, { waitUntil: vi.fn() });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
    expect(cache.put).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://otakuvid.online/hls/segment-1.ts',
      expect.objectContaining({ headers: expect.objectContaining({ Range: 'bytes=0-1023' }) })
    );
  });

  it('reports an unavailable source without surfacing an HTTP error to the browser', async () => {
    const cache = stubEdgeCache();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        '<script>const src = "https://otakuhg.site/hls/master.m3u8";</script>',
        { headers: { 'Content-Type': 'text/html' } }
      ))
      .mockResolvedValueOnce(new Response(
        '#EXTM3U\n#EXTINF:10,\nsegment.ts\n',
        { headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } }
      ))
      .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request(
      'https://worker.example/?probe=1&embed=' +
      encodeURIComponent('https://otakuhg.site/e/grand-blue')
    );
    const response = await worker.fetch(request, {}, { waitUntil: vi.fn() });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false });
    expect(response.headers.get('cache-control')).toBe('public, max-age=15');
    expect(cache.put).toHaveBeenCalledOnce();
  });

  it('returns a cached probe without contacting the embed provider again', async () => {
    const cached = Response.json({ available: true }, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
    const cache = stubEdgeCache(cached);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request(
      'https://worker.example/?probe=1&embed=' +
      encodeURIComponent('https://otakuvid.online/embed/grand-blue')
    );
    const response = await worker.fetch(request, {}, { waitUntil: vi.fn() });

    expect(await response.json()).toEqual({ available: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('cuts off an unresponsive provider after 3.5 seconds at the edge', async () => {
    vi.useFakeTimers();
    const cache = stubEdgeCache();
    const fetchMock = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const request = new Request(
        'https://worker.example/?probe=1&embed=' +
        encodeURIComponent('https://otakuvid.online/embed/slow')
      );
      const responsePromise = worker.fetch(request, {}, { waitUntil: vi.fn() });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(3_500);
      const response = await responsePromise;

      expect(await response.json()).toEqual({ available: false });
      expect(response.headers.get('cache-control')).toBe('public, max-age=15');
      expect(cache.put).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Cloudflare Telegram sticker gateway', () => {
  const pack = 'kiiromiko_by_kiiro_sticker_bot';
  const fileId = 'CAACAgUAAxkBAASticker123';
  const stickerSet = {
    ok: true,
    result: {
      name: pack,
      title: 'Kiiro Miko Emotes',
      stickers: [{
        file_id: fileId,
        file_unique_id: 'AgADStickerUnique123',
        emoji: '😊',
        is_animated: false,
        is_video: false,
      }],
    },
  };

  it('returns an allowlisted pack without exposing the bot token', async () => {
    const cache = stubEdgeCache();
    const fetchMock = vi.fn().mockResolvedValue(Response.json(stickerSet));
    vi.stubGlobal('fetch', fetchMock);
    const request = new Request(`https://worker.example/?stickerPack=${pack}`);

    const response = await worker.fetch(request, { TELEGRAM_BOT_TOKEN: 'secret-token' }, { waitUntil: vi.fn() });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      name: pack,
      title: 'Kiiro Miko Emotes',
      stickers: [{ fileId, format: 'webp' }],
    });
    expect(JSON.stringify(data)).not.toContain('secret-token');
    expect(fetchMock.mock.calls[0][0]).toContain('/botsecret-token/getStickerSet');
    expect(cache.put).toHaveBeenCalledOnce();
  });

  it('validates membership then streams and caches a sticker file', async () => {
    const cache = stubEdgeCache();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(stickerSet))
      .mockResolvedValueOnce(Response.json({
        ok: true,
        result: { file_path: 'stickers/file_123.webp' },
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'image/webp' },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const request = new Request(
      `https://worker.example/?telegramSticker=${fileId}&pack=${pack}`,
    );

    const response = await worker.fetch(request, { TELEGRAM_BOT_TOKEN: 'secret-token' }, { waitUntil: vi.fn() });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(cache.put).toHaveBeenCalledOnce();
  });

  it('rejects non-curated packs before contacting Telegram', async () => {
    stubEdgeCache();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(
      new Request('https://worker.example/?stickerPack=unknown_pack'),
      { TELEGRAM_BOT_TOKEN: 'secret-token' },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
