const TMDB_BASE = 'https://api.themoviedb.org/3';
const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

const fetchTMDB = async (endpoint, params = {}) => {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.append('api_key', API_KEY);
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json;charset=utf-8'
    }
  });
  return res.json();
};

export const tmdbImage = (path, size = 'w500') => path ? `https://image.tmdb.org/t/p/${size}${path}` : '/placeholder.png';

export const searchContent = (query, type) => fetchTMDB(`/search/${type}`, { query });
export const getTrending = (type, window = 'week') => fetchTMDB(`/trending/${type}/${window}`);
export const getMovieDetail = (id) => fetchTMDB(`/movie/${id}`, { append_to_response: 'credits,videos,external_ids' });
export const getTVDetail = (id) => fetchTMDB(`/tv/${id}`, { append_to_response: 'credits,videos,external_ids' });
export const getTVSeason = (id, season) => fetchTMDB(`/tv/${id}/season/${season}`);
export const getGenres = (type) => fetchTMDB(`/genre/${type}/list`);
export const discoverContent = (type, params) => fetchTMDB(`/discover/${type}`, params);
