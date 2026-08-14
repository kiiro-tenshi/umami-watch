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

export function findNextHlsSource(sources, currentIndex, failedUrls = new Set()) {
  for (let index = currentIndex + 1; index < sources.length; index += 1) {
    if (sources[index]?.type === 'hls' && !failedUrls.has(sources[index].url)) return index;
  }
  return -1;
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
