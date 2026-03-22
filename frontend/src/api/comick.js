const API_BASE = `${import.meta.env.VITE_API_BASE_URL}/api/proxy/comick`;
const IMG_BASE = `${import.meta.env.VITE_API_BASE_URL}/api/comick`;

const ckFetch = async (path, params = {}) => {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`ComicK error ${res.status}: ${path}`);
  return res.json();
};

// Search ComicK by title. Returns array of { id, hid, slug, title, ... }
export const searchComick = async (title) => {
  const data = await ckFetch('/v1.0/search', { q: title, limit: 5 });
  // api.comick.dev returns { data: [...] }
  return Array.isArray(data) ? data : (data.data || []);
};

// Get English chapters for a ComicK manga HID, ascending order.
// Returns { chapters: [...], total: N }
export const getComickChapters = async (hid, page = 1) => {
  const data = await ckFetch(`/comic/${hid}/chapters`, {
    lang: 'en',
    page,
    limit: 60,
    'chap-order': 1,
  });
  return { chapters: data.chapters || [], total: data.total || 0 };
};

// Get proxied image URLs for a chapter (server scrapes comick.art HTML).
// slug = manga slug (e.g. "00-sousou-no-frieren")
// hid  = chapter HID (e.g. "QBwl0")
// chap = chapter number string (e.g. "1")
export const getComickImages = async (slug, hid, chap, lang = 'en') => {
  const url = new URL(`${IMG_BASE}/images`);
  url.searchParams.set('slug', slug);
  url.searchParams.set('hid', hid);
  url.searchParams.set('chap', chap);
  url.searchParams.set('lang', lang);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`ComicK images error ${res.status}`);
  const data = await res.json();
  return data.images || [];
};
