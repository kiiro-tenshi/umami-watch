export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const CORS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const targetUrl = url.searchParams.get('url');
    const referer   = url.searchParams.get('referer') || 'https://vibeplayer.site/';

    if (!targetUrl) {
      return new Response('url parameter required', { status: 400, headers: CORS });
    }

    const decodedUrl     = decodeURIComponent(targetUrl);
    const decodedReferer = decodeURIComponent(referer);

    const contentType = (decodedUrl.match(/\.(m3u8|ts|vtt|srt|ass)(\?|$)/i) || [])[1] || '';
    const isM3u8 = /m3u8/i.test(contentType) || decodedUrl.includes('.m3u8');
    const isSegment = !isM3u8; // .ts, .vtt, etc.

    // Check CF edge cache for segments (not manifests — those change frequently)
    const cache = caches.default;
    if (isSegment) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }

    let response;
    try {
      response = await fetch(decodedUrl, {
        headers: {
          'Referer':    decodedReferer,
          'Origin':     new URL(decodedReferer).origin,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
    } catch (err) {
      return new Response(err.message, { status: 502, headers: CORS });
    }

    if (!response.ok) {
      return new Response(await response.text(), { status: response.status, headers: CORS });
    }

    const upstreamCT = response.headers.get('content-type') || '';

    // CDN returned a Cloudflare block/challenge page — tell client to use fallback proxy
    if (upstreamCT.includes('text/html')) {
      return new Response('Upstream blocked this request', { status: 530, headers: CORS });
    }

    const isManifest = upstreamCT.includes('mpegurl') || isM3u8;

    if (isManifest) {
      const text   = await response.text();
      const urlObj = new URL(decodedUrl);
      const basePath = urlObj.origin + urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1);
      const workerBase = url.origin + url.pathname;

      const makeProxied = (rawUrl) => {
        const abs = rawUrl.startsWith('http')
          ? rawUrl
          : rawUrl.startsWith('/')
            ? urlObj.origin + rawUrl
            : basePath + rawUrl;
        return `${workerBase}?url=${encodeURIComponent(abs)}&referer=${encodeURIComponent(decodedReferer)}`;
      };

      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (trimmed === '') return line;
        if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${makeProxied(uri)}"`);
        }
        if (trimmed.startsWith('#')) return line;
        return makeProxied(trimmed);
      }).join('\n');

      return new Response(rewritten, {
        headers: { ...CORS, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'public, max-age=5' },
      });
    }

    // Binary content: TS segments, VTT subtitles, etc.
    const body = await response.arrayBuffer();
    const resp = new Response(body, {
      headers: { ...CORS, 'Content-Type': upstreamCT || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600, immutable' },
    });

    // Store segments in CF edge cache — subsequent requests skip upstream entirely
    ctx.waitUntil(cache.put(request, resp.clone()));

    return resp;
  },
};
