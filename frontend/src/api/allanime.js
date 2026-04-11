import { auth } from '../firebase.js';

const BASE = `${import.meta.env.VITE_API_BASE_URL || ''}/api/anime/allanime`;

const get = async (path, params = {}) => {
  const url = new URL(`${BASE}/${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`AllAnime API error: ${res.status}`);
  return res.json();
};

/**
 * Search AllAnime by title.
 * Returns: { shows: [{ _id, name, englishName, thumbnail }] }
 */
export const searchAllAnime = (query) =>
  get('search', { q: query });

/**
 * Get episode list for a show.
 * Returns: { id, name, englishName, episodes: { sub: ['1','2',...], dub: [...] } }
 */
export const getAllAnimeShow = (showId) =>
  get(`show/${encodeURIComponent(showId)}`);

/**
 * Get stream sources for an episode.
 * type: 'sub' | 'dub'
 * Returns: { sources: [{ name, priority, type: 'iframe'|'direct', url }] }
 */
export const getAllAnimeSources = (showId, ep, type = 'sub') =>
  get('sources', { showId, ep: String(ep), type });

/**
 * Pick the AllAnime show from a search result list that best matches a given title.
 * Scores each show by how many words from the search title appear in the show name,
 * penalising names that have more words (e.g. "Season 2" suffix) by 0.5 per extra word.
 * Falls back to shows[0] if the list is empty.
 */
export function pickBestShow(shows, searchTitle) {
  if (!shows || shows.length === 0) return null;
  const normalise = s => s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  const searchWords = normalise(searchTitle).split(' ');
  const scored = shows.map(s => {
    const normName = normalise(s.englishName || s.name || '');
    const matchCount = searchWords.filter(w => normName.includes(w)).length;
    const extraWords = normName.split(' ').length - searchWords.length;
    return { show: s, score: matchCount - Math.max(0, extraWords) * 0.5 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].show;
}

/**
 * Build a proxied video URL for direct MP4 sources (AllAnime CDN has no CORS).
 * Uses the Cloudflare Worker proxy (free egress) when available,
 * falling back to the Cloud Run backend proxy.
 */
export const buildVideoProxyUrl = (rawUrl) => {
  const workerBase = import.meta.env.VITE_HLS_PROXY_URL;
  if (workerBase) {
    const u = new URL(workerBase);
    u.searchParams.set('url', rawUrl);
    return u.toString();
  }
  // Fallback: Cloud Run proxy (incurs egress charges)
  const base = `${import.meta.env.VITE_API_BASE_URL || ''}/api/proxy/video`;
  const u = new URL(base, window.location.origin);
  u.searchParams.set('url', rawUrl);
  return u.toString();
};
