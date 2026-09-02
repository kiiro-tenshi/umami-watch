const SUPPORTED_EMBED_HOSTS = new Set(['vivibebe.site', 'otakuhg.site', 'otakuvid.online']);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const PROBE_TIMEOUT_MS = 3_500;
const AVAILABLE_CACHE_SECONDS = 60;
const UNAVAILABLE_CACHE_SECONDS = 15;
const TELEGRAM_STICKER_PACKS = new Map([
  ['kiiromiko_by_kiiro_sticker_bot', 'Kiiro Miko'],
  ['kiirouniform_by_kiiro_sticker_bot', 'Kiiro Uniform'],
]);

function telegramStickerFile(sticker) {
  if (sticker.is_video) {
    return sticker.file_id ? { fileId: sticker.file_id, format: 'webm' } : null;
  }
  if (sticker.is_animated) {
    // TGS needs a dedicated renderer. Use Telegram's static thumbnail until one
    // is added so every curated pack remains usable in regular browsers.
    return sticker.thumbnail?.file_id
      ? { fileId: sticker.thumbnail.file_id, format: 'webp' }
      : null;
  }
  return sticker.file_id ? { fileId: sticker.file_id, format: 'webp' } : null;
}

async function telegramApi(env, method, params) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('Telegram stickers are not configured');
  const query = new URLSearchParams(params);
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}?${query}`);
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.description || `Telegram ${method} failed`);
  return result.result;
}

async function getTelegramStickerSet(env, packName) {
  if (!TELEGRAM_STICKER_PACKS.has(packName)) throw new Error('Sticker pack is not allowed');
  return telegramApi(env, 'getStickerSet', { name: packName });
}

async function serveTelegramPack(request, url, env, ctx, cors) {
  const packName = url.searchParams.get('stickerPack');
  if (!TELEGRAM_STICKER_PACKS.has(packName)) {
    return Response.json({ error: 'Sticker pack is not allowed' }, { status: 404, headers: cors });
  }

  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const set = await getTelegramStickerSet(env, packName);
    const workerBase = url.origin + url.pathname;
    const stickers = (set.stickers || []).flatMap(sticker => {
      const file = telegramStickerFile(sticker);
      if (!file) return [];
      const stickerUrl = new URL(workerBase);
      stickerUrl.searchParams.set('telegramSticker', file.fileId);
      stickerUrl.searchParams.set('pack', packName);
      return [{
        id: sticker.file_unique_id,
        fileId: file.fileId,
        emoji: sticker.emoji || '',
        format: file.format,
        url: stickerUrl.toString(),
      }];
    });
    const response = Response.json({
      name: packName,
      title: set.title || TELEGRAM_STICKER_PACKS.get(packName),
      stickers,
    }, { headers: { ...cors, 'Cache-Control': 'public, max-age=3600' } });
    ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  } catch (error) {
    const status = /not configured/i.test(error.message) ? 503 : 502;
    return Response.json({ error: error.message }, { status, headers: cors });
  }
}

async function serveTelegramSticker(request, url, env, ctx, cors) {
  const packName = url.searchParams.get('pack');
  const fileId = url.searchParams.get('telegramSticker');
  if (!TELEGRAM_STICKER_PACKS.has(packName) || !/^[A-Za-z0-9_-]{10,250}$/.test(fileId || '')) {
    return new Response('Sticker is not allowed', { status: 404, headers: cors });
  }

  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const set = await getTelegramStickerSet(env, packName);
    const sticker = (set.stickers || []).find(item => telegramStickerFile(item)?.fileId === fileId);
    if (!sticker) return new Response('Sticker is not in this pack', { status: 404, headers: cors });

    const file = await telegramApi(env, 'getFile', { file_id: fileId });
    if (!/^(?:stickers|photos)\/[A-Za-z0-9_./-]+$/.test(file.file_path || '')) {
      return new Response('Invalid Telegram sticker path', { status: 502, headers: cors });
    }
    const upstream = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
    if (!upstream.ok) return new Response('Telegram sticker download failed', { status: 502, headers: cors });

    const format = telegramStickerFile(sticker)?.format;
    const contentType = upstream.headers.get('content-type')
      || (format === 'webm' ? 'video/webm' : 'image/webp');
    const response = new Response(upstream.body, {
      headers: {
        ...cors,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
    ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  } catch (error) {
    const status = /not configured/i.test(error.message) ? 503 : 502;
    return new Response(error.message, { status, headers: cors });
  }
}

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

async function resolveEmbed(embedUrl, pageReferer, signal) {
  const parsed = new URL(embedUrl);
  if (parsed.protocol !== 'https:' || !SUPPORTED_EMBED_HOSTS.has(parsed.hostname)) {
    throw new Error('Unsupported embed host');
  }

  const response = await fetch(parsed.href, {
    signal,
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

function upstreamHeaders(referer, extra = {}) {
  return {
    'Referer': referer,
    'Origin': new URL(referer).origin,
    'User-Agent': UA,
    ...extra,
  };
}

async function probeHls(hlsUrl, referer, signal) {
  let manifestUrl = hlsUrl;

  // Follow a master playlist into its first media playlist. Two levels covers
  // the providers used here while keeping probes cheap at the Worker edge.
  for (let depth = 0; depth < 2; depth += 1) {
    const response = await fetch(manifestUrl, { signal, headers: upstreamHeaders(referer) });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || contentType.includes('text/html')) return false;

    const manifest = await response.text();
    if (!manifest.includes('#EXTM3U')) return false;
    const firstUri = manifest.split('\n')
      .map(line => line.trim())
      .find(line => line && !line.startsWith('#'));
    if (!firstUri) return false;

    const resolvedUri = new URL(firstUri, manifestUrl).href;
    if (manifest.includes('#EXT-X-STREAM-INF')) {
      manifestUrl = resolvedUri;
      continue;
    }

    // Validate that the CDN will actually serve media, not just a manifest.
    // Cancel immediately after headers arrive so the availability check does not
    // download a complete segment.
    const segment = await fetch(resolvedUri, {
      signal,
      headers: upstreamHeaders(referer, { Range: 'bytes=0-1023' }),
    });
    const segmentType = segment.headers.get('content-type') || '';
    const available = segment.ok && !segmentType.includes('text/html');
    await segment.body?.cancel().catch(() => {});
    return available;
  }

  return false;
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
    const wantsProbe = url.searchParams.get('probe') === '1';

    if (url.searchParams.has('stickerPack')) {
      return serveTelegramPack(request, url, env, ctx, CORS);
    }
    if (url.searchParams.has('telegramSticker')) {
      return serveTelegramSticker(request, url, env, ctx, CORS);
    }

    if (!targetUrl && !embedUrl) {
      return new Response('url or embed parameter required', { status: 400, headers: CORS });
    }

    // Probe responses are short-lived at the edge: working streams usually return
    // instantly on repeat visits, while a temporary failure is retried after 15 s.
    if (wantsProbe) {
      const cache = caches.default;
      const cached = await cache.match(request);
      if (cached) return cached;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      let available = false;
      try {
        let hlsUrl = targetUrl;
        let probeReferer;
        if (embedUrl) {
          const resolved = await resolveEmbed(
            embedUrl,
            url.searchParams.get('referer') || 'https://anineko.to/',
            controller.signal
          );
          hlsUrl = resolved.hlsUrl;
          probeReferer = resolved.referer;
        }
        probeReferer = probeReferer
          || url.searchParams.get('referer')
          || new URL(hlsUrl).origin + '/';
        available = await probeHls(hlsUrl, probeReferer, controller.signal);
      } catch { /* unavailable or timed out */ }
      finally { clearTimeout(timeout); }

      const maxAge = available ? AVAILABLE_CACHE_SECONDS : UNAVAILABLE_CACHE_SECONDS;
      const response = Response.json({ available }, {
        headers: { ...CORS, 'Cache-Control': `public, max-age=${maxAge}` },
      });
      ctx.waitUntil(cache.put(request, response.clone()));
      return response;
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

    // Stream media bytes immediately. Buffering the full segment with
    // arrayBuffer() delayed the first byte until the upstream download finished,
    // which made the player repeatedly enter a long buffering state.
    const resp = new Response(response.body, {
      status: response.status,
      headers: { ...CORS, 'Content-Type': upstreamCT || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600, immutable' },
    });

    // Store segments in CF edge cache — subsequent requests skip upstream entirely
    ctx.waitUntil(cache.put(request, resp.clone()));

    return resp;
  },
};
