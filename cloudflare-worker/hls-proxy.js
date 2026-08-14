const SUPPORTED_EMBED_HOSTS = new Set(['vivibebe.site', 'otakuhg.site', 'otakuvid.online']);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function decodeJsString(value) {
  return value.replace(/\\(x[0-9a-f]{2}|u[0-9a-f]{4}|n|r|t|b|f|v|0|\\|'|")/gi, (_match, escape) => {
    if (escape[0].toLowerCase() === 'x') return String.fromCharCode(parseInt(escape.slice(1), 16));
    if (escape[0].toLowerCase() === 'u') return String.fromCharCode(parseInt(escape.slice(1), 16));
    return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' }[escape] ?? escape;
  });
}

export function unpackPacker(html) {
  const packed = html.match(
    /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('((?:\\.|[^'])*)',(\d+),(\d+),'((?:\\.|[^'])*)'\.split\('\|'\)\)\)/
  );
  if (!packed) return null;

  const radix = Number(packed[2]);
  const count = Number(packed[3]);
  if (radix < 2 || radix > 36 || count > 5000) return null;

  let output = decodeJsString(packed[1]);
  const words = decodeJsString(packed[4]).split('|');
  for (let index = count - 1; index >= 0; index -= 1) {
    if (!words[index]) continue;
    const key = index.toString(radix);
    output = output.replace(new RegExp('\\b' + key + '\\b', 'g'), () => words[index]);
  }
  return output;
}

export function extractHlsFromEmbedHtml(html, embedUrl) {
  const direct = html.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i)?.[0];
  if (direct) return new URL(direct.replace(/&amp;/gi, '&'), embedUrl).href;

  const unpacked = unpackPacker(html);
  if (!unpacked) return null;

  const links = new Map();
  const linkRe = /["'](hls\d+)["']\s*:\s*["']([^"']+)["']/gi;
  let link;
  while ((link = linkRe.exec(unpacked)) !== null) links.set(link[1].toLowerCase(), link[2]);

  for (const key of ['hls4', 'hls3', 'hls2', 'hls1']) {
    const candidate = links.get(key);
    if (candidate && /\.m3u8(?:\?|$)/i.test(candidate)) return new URL(candidate, embedUrl).href;
  }
  return unpacked.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i)?.[0] || null;
}

async function resolveEmbed(embedUrl, pageReferer) {
  const parsed = new URL(embedUrl);
  if (parsed.protocol !== 'https:' || !SUPPORTED_EMBED_HOSTS.has(parsed.hostname)) {
    throw new Error('Unsupported embed host');
  }

  const response = await fetch(parsed.href, {
    headers: {
      'Referer': pageReferer,
      'Origin': new URL(pageReferer).origin,
      'User-Agent': UA,
    },
  });
  if (!response.ok) throw new Error('Embed returned ' + response.status);

  const hlsUrl = extractHlsFromEmbedHtml(await response.text(), parsed.href);
  if (!hlsUrl) throw new Error('No HLS manifest found in embed');
  return { hlsUrl, referer: parsed.origin + '/' };
}

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
    const embedUrl = url.searchParams.get('embed');

    if (!targetUrl && !embedUrl) {
      return new Response('url or embed parameter required', { status: 400, headers: CORS });
    }

    let decodedUrl;
    let resolvedReferer;
    if (embedUrl) {
      try {
        const resolved = await resolveEmbed(
          embedUrl,
          url.searchParams.get('referer') || 'https://anineko.to/'
        );
        decodedUrl = resolved.hlsUrl;
        resolvedReferer = resolved.referer;
      } catch (err) {
        return new Response(err.message, { status: 502, headers: CORS });
      }
    } else {
      decodedUrl = targetUrl;
    }

    // The client (WatchPage) passes an explicit referer derived from the current
    // player host, which rotates. Fall back to the target's own origin rather than a
    // hardcoded host so a missing param never sends a stale referer.
    const referer        = resolvedReferer || url.searchParams.get('referer') || new URL(decodedUrl).origin + '/';
    const decodedReferer = referer;

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
          'User-Agent': UA,
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
