import express from 'express';
import { ProviderUnavailableError } from '../services/aninekoClient.js';

const router = express.Router();
const PROVIDER_ROOT = 'https://megavid.buzz';
const REFERER = `${PROVIDER_ROOT}/`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const LANGUAGE_CODES = {
  english: 'en', japanese: 'ja', spanish: 'es', french: 'fr', german: 'de',
  italian: 'it', portuguese: 'pt', arabic: 'ar', russian: 'ru',
};

function subtitleLanguage(track) {
  const label = String(track.label || '').toLowerCase();
  for (const [name, code] of Object.entries(LANGUAGE_CODES)) {
    if (label.includes(name)) return code;
  }
  const match = String(track.file || '').match(/(?:^|[_./-])([a-z]{2,3})(?:[_./-]|$)/i);
  if (!match) return 'en';
  return match[1].toLowerCase() === 'eng' ? 'en' : match[1].toLowerCase();
}

export function normalizeMegaVidPayload(data) {
  if (data?.status !== 'ok' || typeof data.source !== 'string') {
    throw new Error('Backup provider has no stream for this episode.');
  }

  const sourceUrl = new URL(data.source);
  if (sourceUrl.protocol !== 'https:' || (data.type !== 'hls' && !sourceUrl.pathname.includes('.m3u8'))) {
    throw new Error('Backup provider returned an unsupported stream.');
  }

  const tracks = (Array.isArray(data.tracks) ? data.tracks : []).flatMap(track => {
    if (!track?.file) return [];
    try {
      const url = new URL(track.file);
      if (url.protocol !== 'https:') return [];
      return [{
        kind: 'subtitles',
        label: track.label || 'Subtitle',
        srclang: subtitleLanguage(track),
        src: url.href,
        default: Boolean(track.default),
      }];
    } catch {
      return [];
    }
  });

  return {
    provider: 'megavid',
    sources: [{ label: 'Backup HLS', hlsUrl: sourceUrl.href, referer: REFERER, tracks }],
  };
}

export function createMegaVidClient({ fetchFn = fetch, timeoutMs = 3_000, retries = 1, cacheMs = 60_000, now = Date.now } = {}) {
  const cache = new Map();

  async function getSources(malId, episode, type = 'sub') {
    const key = `${malId}:${episode}:${type}`;
    const cached = cache.get(key);
    if (cached && now() - cached.savedAt < cacheMs) return cached.value;

    const endpoint = `${PROVIDER_ROOT}/mal/${malId}/${episode}/${type}/source`;
    let lastError;
    for (let index = 0; index <= retries; index += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchFn(endpoint, {
          signal: controller.signal,
          headers: { Accept: 'application/json', Referer: REFERER, 'User-Agent': UA },
        });
        if (response.status === 404) {
          const error = new Error('Backup provider has no stream for this episode.');
          error.statusCode = 404;
          error.code = 'EPISODE_NOT_FOUND';
          throw error;
        }
        if (!response.ok) throw new Error(`MegaVid responded with ${response.status}`);
        const value = normalizeMegaVidPayload(await response.json());
        cache.set(key, { value, savedAt: now() });
        return value;
      } catch (error) {
        lastError = error;
        if (error.statusCode === 404 || /no stream|unsupported stream/i.test(error.message)) throw error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new ProviderUnavailableError('megavid', 'Backup anime provider is temporarily unavailable.', { cause: lastError });
  }

  return { getSources };
}

export const megaVidClient = createMegaVidClient();

router.get('/sources', async (req, res) => {
  const { malId, ep, type = 'sub' } = req.query;
  if (!/^\d+$/.test(String(malId || '')) || !/^\d+(?:\.\d+)?$/.test(String(ep || '')) || !['sub', 'dub'].includes(type)) {
    return res.status(400).json({ error: 'Valid malId, ep, and type are required.', code: 'INVALID_REQUEST' });
  }

  try {
    res.json(await megaVidClient.getSources(malId, ep, type));
  } catch (error) {
    const status = error.statusCode || 503;
    if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
    res.status(status).json({
      error: error.message,
      code: error.code || 'PROVIDER_UNAVAILABLE',
      provider: error.provider || 'megavid',
      retryAfter: error.retryAfter,
    });
  }
});

export default router;
