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
  const data = await ckFetch('/search', { q: title, limit: 5 });
  // comick.art returns { data: [...] }
  return Array.isArray(data) ? data : (data.data || []);
};

// Get all English chapters for a ComicK manga slug, ascending order.
// Fetches all pages in parallel after discovering last_page from page 1.
// Returns { chapters: [...], total: N }
export const getComickChapters = async (slug) => {
  const params = { lang: 'en', chapOrder: 'asc' };
  const first = await ckFetch(`/comics/${slug}/chapter-list`, { ...params, page: 1 });
  const lastPage = first.pagination?.last_page || 1;
  let all = first.data || [];
  if (lastPage > 1) {
    const rest = await Promise.all(
      Array.from({ length: lastPage - 1 }, (_, i) =>
        ckFetch(`/comics/${slug}/chapter-list`, { ...params, page: i + 2 })
          .then(d => d.data || [])
          .catch(() => [])
      )
    );
    all = all.concat(rest.flat());
  }
  return { chapters: all, total: all.length };
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
