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

export function pickBestShow(shows, searchTitle) {
  if (!shows?.length) return null;
  const normalise = s => s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  const searchWords = normalise(searchTitle).split(' ');
  const scored = shows.map(s => {
    const normName = normalise(s.title || '');
    const matchCount = searchWords.filter(w => normName.includes(w)).length;
    const extraWords = normName.split(' ').length - searchWords.length;
    return { show: s, score: matchCount - Math.max(0, extraWords) * 0.5 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].show;
}
