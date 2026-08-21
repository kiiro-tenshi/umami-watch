import { auth } from '../firebase.js';

const BACKEND = `${import.meta.env.VITE_API_BASE_URL || ''}/api/anime/gogoanime`;

async function backendGet(path, params = {}) {
  const url = new URL(`${BACKEND}/${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`GogoAnime error: ${res.status}`);
  return res.json();
}

export const searchGogoanime = (q) => backendGet('search', { q });
export const getGogoanimeEpisodes = (slug) => backendGet('episodes', { slug });
export const getGogoanimeSource = (slug, ep) => backendGet('sources', { slug, ep: String(ep) });

export function buildProxiedHlsSources(sourceData, workerBase) {
  if (!workerBase) {
    throw new Error('Cloudflare HLS proxy is not configured. Refusing to send video through Cloud Run.');
  }

  const candidates = Array.isArray(sourceData?.sources)
    ? sourceData.sources
    : sourceData?.hlsUrl
      ? [{
          label: 'HLS 1',
          hlsUrl: sourceData.hlsUrl,
          referer: sourceData.referer,
          tracks: sourceData.tracks || [],
        }]
      : [];

  const seen = new Set();
  return candidates.flatMap((source, index) => {
    const target = source.embedUrl || source.hlsUrl;
    if (!target || seen.has(target)) return [];
    seen.add(target);

    const workerUrl = new URL(workerBase);
    if (source.embedUrl) {
      workerUrl.searchParams.set('embed', source.embedUrl);
      workerUrl.searchParams.set('referer', 'https://anineko.to/');
    } else {
      workerUrl.searchParams.set('url', source.hlsUrl);
      workerUrl.searchParams.set('referer', source.referer || new URL(source.hlsUrl).origin + '/');
    }

    return [{
      label: source.label || 'HLS ' + (index + 1),
      url: workerUrl.toString(),
      type: 'hls',
      tracks: source.tracks || [],
    }];
  });
}

const SOURCE_PROBE_TIMEOUT_MS = 4_000;

async function checkHlsSource(source, fetchFn, controllers) {
  if (source.type !== 'hls') return null;
  const probeUrl = new URL(source.url);
  probeUrl.searchParams.set('probe', '1');
  const controller = new AbortController();
  controllers.add(controller);
  const timeout = setTimeout(() => controller.abort(), SOURCE_PROBE_TIMEOUT_MS);

  try {
    const response = await fetchFn(probeUrl.toString(), { signal: controller.signal });
    if (!response.ok) return null;

    const contentType = response.headers?.get?.('content-type') || '';
    // Backward compatibility while the updated Worker is being deployed: the
    // previous Worker ignores probe=1 and returns the HLS manifest itself.
    if (/mpegurl/i.test(contentType)) return source;

    const result = await response.json();
    return result?.available ? source : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    controllers.delete(controller);
  }
}

// Starts every check together. `first` resolves as soon as one mirror works;
// `complete` keeps going only until a second mirror is found (or all checks end).
export function probeAvailableHlsSources(sources, fetchFn = fetch, maxSources = 2) {
  const candidates = sources.filter(source => source.type === 'hls');
  const controllers = new Set();
  let available = [];
  let settled = 0;
  let finished = false;
  let resolveFirst;
  let resolveComplete;
  const first = new Promise(resolve => { resolveFirst = resolve; });
  const complete = new Promise(resolve => { resolveComplete = resolve; });

  const finish = () => {
    if (finished) return;
    finished = true;
    const result = [...available];
    resolveFirst(result[0] || null);
    resolveComplete(result);
    controllers.forEach(controller => controller.abort());
    controllers.clear();
  };

  if (!candidates.length || maxSources < 1) {
    finish();
  } else {
    candidates.forEach(source => {
      checkHlsSource(source, fetchFn, controllers).then(result => {
        settled += 1;
        if (finished) return;
        if (result) {
          available = [...available, result];
          if (available.length === 1) resolveFirst(result);
        }
        if (available.length >= maxSources || settled === candidates.length) finish();
      });
    });
  }

  return {
    first,
    complete,
    cancel: finish,
  };
}

export async function filterAvailableHlsSources(sources, fetchFn = fetch, maxSources = 2) {
  const probe = probeAvailableHlsSources(sources, fetchFn, maxSources);
  return probe.complete;
}

export function findNextHlsSource(sources, currentIndex, failedUrls = new Set()) {
  for (let offset = 1; offset < sources.length; offset += 1) {
    const index = (currentIndex + offset) % sources.length;
    if (sources[index]?.type === 'hls' && !failedUrls.has(sources[index].url)) return index;
  }
  return -1;
}

export function planHlsRecovery(sources, currentIndex, failedUrls = new Set(), retryCount = 0) {
  const current = sources[currentIndex];
  if (!current) return { action: 'error' };

  const unavailable = new Set(failedUrls);
  unavailable.add(current.url);
  const nextIndex = findNextHlsSource(sources, currentIndex, unavailable);
  if (nextIndex >= 0) return { action: 'switch', nextIndex };
  if (retryCount < 1) return { action: 'retry' };
  return { action: 'error' };
}

export function pickBestShow(shows, searchTitle) {
  if (!shows?.length) return null;
  const normalise = s => s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  const isDub = s => /\bdub\b/i.test(s.title || '') || /-dub$/.test(s.slug || '');
  const searchNorm = normalise(searchTitle);
  const searchCompact = searchNorm.replace(/\s/g, '');
  const searchWords = searchNorm.split(' ').filter(Boolean);
  const scored = shows.map(s => {
    const normName = normalise(s.title || '');
    const normCompact = normName.replace(/\s/g, '');
    const matchCount = searchWords.filter(w => normName.includes(w)).length;
    const extraWords = normName.split(' ').filter(Boolean).length - searchWords.length;
    const dubPenalty = isDub(s) ? 100 : 0;
    // Handles titles like "MARRIAGETOXIN" ↔ "Marriage Toxin" (same chars, different spacing)
    const compactBonus = (searchCompact && normCompact === searchCompact) ? 3 : 0;
    return { show: s, score: matchCount - Math.max(0, extraWords) * 0.5 - dubPenalty + compactBonus, matchCount, compactBonus };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  // No words matched and no compact match → genuinely unrelated, let caller try fallback
  if (best.matchCount === 0 && best.compactBonus === 0) return null;
  // Only dub matched with a negative score → return null so caller can try romaji fallback
  if (isDub(best.show) && best.score < 0) return null;
  return best.show;
}
