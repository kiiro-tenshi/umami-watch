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
 * Build a proxied video URL for direct MP4 sources (AllAnime CDN has no CORS).
 * The backend range-proxy passes Range headers through for seeking support.
 */
export const buildVideoProxyUrl = (rawUrl, token) => {
  const base = `${import.meta.env.VITE_API_BASE_URL || ''}/api/proxy/video`;
  const url = new URL(base, window.location.origin);
  url.searchParams.set('url', rawUrl);
  if (token) url.searchParams.set('token', token);
  return url.toString();
};
