import { auth } from '../firebase.js';

const WORKER_BASE = import.meta.env.VITE_HLS_PROXY_URL;
const BACKEND_BASE = `${import.meta.env.VITE_API_BASE_URL || ''}/api/anime/allanime`;

// XOR-56 decode for source URLs prefixed with '--'
function decodeUrl(encoded) {
  if (!encoded.startsWith('--')) return encoded;
  const hex = encoded.slice(2);
  return Array.from({ length: hex.length / 2 }, (_, i) =>
    String.fromCharCode(parseInt(hex.slice(i * 2, i * 2 + 2), 16) ^ 56)
  ).join('');
}

// AES-256-GCM decode for 'tobeparsed' responses — uses WebCrypto (browser-native)
let _cachedKey = null;
async function getTobeparsedKey() {
  if (_cachedKey) return _cachedKey;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('Xot36i3lK3:v1'));
  _cachedKey = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['decrypt']);
  return _cachedKey;
}
async function decodeTobeparsed(tbp) {
  const raw = Uint8Array.from(atob(tbp), c => c.charCodeAt(0));
  const iv = raw.slice(1, 13);
  const key = await getTobeparsedKey();
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, raw.slice(13));
  return JSON.parse(new TextDecoder().decode(dec));
}

// GraphQL POST via Cloudflare Worker — bypasses Cloud Run IP blocking
async function gqlPost(query, variables) {
  const workerUrl = new URL(WORKER_BASE);
  workerUrl.searchParams.set('mode', 'allanime');
  const res = await fetch(workerUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`AllAnime API error: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return (json.data?._m && json.data?.tobeparsed)
    ? await decodeTobeparsed(json.data.tobeparsed)
    : json.data;
}

// Fallback: existing backend GET proxy (local dev without Worker configured)
const backendGet = async (path, params = {}) => {
  const url = new URL(`${BACKEND_BASE}/${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`AllAnime API error: ${res.status}`);
  return res.json();
};

export const searchAllAnime = async (query) => {
  if (!WORKER_BASE) return backendGet('search', { q: query });
  const data = await gqlPost(
    `query($s:SearchInput,$limit:Int,$page:Int){shows(search:$s,limit:$limit,page:$page){edges{_id,name,englishName,thumbnail}}}`,
    { s: { query }, limit: 10, page: 1 }
  );
  return { shows: data.shows.edges };
};

export const getAllAnimeShow = async (showId) => {
  if (!WORKER_BASE) return backendGet(`show/${encodeURIComponent(showId)}`);
  const data = await gqlPost(
    `query($id:String!){show(_id:$id){_id,name,englishName,availableEpisodesDetail}}`,
    { id: showId }
  );
  const show = data.show;
  return { id: show._id, name: show.name, englishName: show.englishName, episodes: show.availableEpisodesDetail || {} };
};

export const getAllAnimeSources = async (showId, ep, type = 'sub') => {
  if (!WORKER_BASE) return backendGet('sources', { showId, ep: String(ep), type });
  const data = await gqlPost(
    `query($id:String!,$ep:String!,$t:VaildTranslationTypeEnumType!){episode(showId:$id,translationType:$t,episodeString:$ep){sourceUrls}}`,
    { id: showId, ep: String(ep), t: type }
  );
  const rawSources = data.episode?.sourceUrls || [];
  const sources = rawSources
    .map(s => ({ ...s, decodedUrl: decodeUrl(s.sourceUrl) }))
    .filter(s => !s.decodedUrl.startsWith('/apivtwo'))
    .filter(s => s.decodedUrl.startsWith('https://') || s.decodedUrl.startsWith('//'))
    .map(s => ({
      name: s.sourceName,
      priority: s.priority,
      type: s.type === 'player' ? 'direct' : 'iframe',
      url: s.decodedUrl,
    }))
    .sort((a, b) => b.priority - a.priority);
  return { sources };
};

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

export const buildVideoProxyUrl = (rawUrl) => {
  const workerBase = import.meta.env.VITE_HLS_PROXY_URL;
  if (workerBase) {
    const u = new URL(workerBase);
    u.searchParams.set('url', rawUrl);
    return u.toString();
  }
  const base = `${import.meta.env.VITE_API_BASE_URL || ''}/api/proxy/video`;
  const u = new URL(base, window.location.origin);
  u.searchParams.set('url', rawUrl);
  return u.toString();
};
