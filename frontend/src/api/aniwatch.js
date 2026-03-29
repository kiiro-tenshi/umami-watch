import { auth } from '../firebase.js';

const BASE = `${import.meta.env.VITE_API_BASE_URL || ''}/api/proxy/aniwatch`;

const get = async (path, params = {}) => {
  const url = new URL(`${BASE}/${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Aniwatch API error: ${res.status}`);
  return res.json();
};

/**
 * Search HiAnime by title string.
 * Returns: { success, data: { animes: [{ id, name, poster, type, episodes }] } }
 */
export const searchAnimeAniwatch = (query) =>
  get('search', { q: query, page: 1 });

/**
 * Get episode list for a HiAnime anime ID (e.g. "one-piece-100").
 * Returns: { success, data: { totalEpisodes, episodes: [{ number, title, episodeId, isFiller }] } }
 */
export const getAniwatchEpisodes = (aniwatchId) =>
  get(`anime/${encodeURIComponent(aniwatchId)}/episodes`);

/**
 * Get available servers for a HiAnime episode ID.
 * Returns: { success, data: { sub: [{serverId, serverName}], dub: [...] } }
 */
export const getAniwatchServers = (episodeId) =>
  get('episode/servers', { animeEpisodeId: episodeId });

/**
 * Get stream sources for a HiAnime episode ID (e.g. "one-piece-100?ep=213").
 * server options: hd-1, hd-2, megacloud, vidstreaming, vidcloud
 * Returns: { success, data: { sources: [{url, isM3U8}], tracks: [{lang, url}], headers: {Referer} } }
 */
export const getAniwatchSources = (episodeId, server = 'hd-1', category = 'sub') =>
  get('episode/sources', { animeEpisodeId: episodeId, server, category });
