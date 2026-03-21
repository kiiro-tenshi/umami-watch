const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const PROXY_BASE = `${API_BASE}/proxy/consumet`;

export const searchAnime = async (query) => {
  const res = await fetch(`${PROXY_BASE}/anime/gogoanime/${encodeURIComponent(query)}`);
  return res.json();
};

export const getAnimeInfo = async (animeId) => {
  const res = await fetch(`${PROXY_BASE}/anime/gogoanime/info/${animeId}`);
  return res.json();
};

export const getEpisodeSources = async (episodeId) => {
  const res = await fetch(`${PROXY_BASE}/anime/gogoanime/watch/${encodeURIComponent(episodeId)}`);
  return res.json();
};

export const pickSource = (sources) => {
  const preferred = ['1080p', '720p', '480p', '360p', 'default', 'backup'];
  for (const quality of preferred) {
    const src = sources.find(s => s.quality === quality);
    if (src) return src;
  }
  return sources[0];
};

export const resolveAnilistToGogoanime = async (anilistId) => {
  try {
    const res = await fetch(`${PROXY_BASE}/utils/anilist-to-gogoanime?id=${anilistId}`);
    if (!res.ok) return null;
    const text = await res.text();
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
};
