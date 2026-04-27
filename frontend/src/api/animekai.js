import { auth } from '../firebase.js';

const BACKEND_BASE = `${import.meta.env.VITE_API_BASE_URL || ''}/api/anime/animekai`;

async function get(path, params = {}) {
  const url = new URL(`${BACKEND_BASE}/${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `AnimeKai API error: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const searchAnimekai = (query) => get('search', { q: query });
export const getAnimekaiEpisodes = (slug) => get('episodes', { slug });
export const getAnimekaiSources = (token, lang = 'sub') => get('sources', { token, lang });

export function pickBestAnimekaiShow(shows, searchTitle) {
  if (!shows?.length) return null;
  const normalise = s => s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  const searchWords = normalise(searchTitle).split(' ').filter(Boolean);
  const scored = shows.map(s => {
    const normName = normalise(s.name || s.japaneseName || '');
    const matchCount = searchWords.filter(w => normName.includes(w)).length;
    const extraWords = normName.split(' ').length - searchWords.length;
    return { show: s, score: matchCount - Math.max(0, extraWords) * 0.5 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].show;
}
