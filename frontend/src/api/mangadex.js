const MD_API = 'https://api.mangadex.org';

export const getTitle = (manga) => {
  const t = manga?.attributes?.title || {};
  return t.en || Object.values(t)[0] || '';
};

export const getDescription = (manga) =>
  manga?.attributes?.description?.en || '';

export const getAuthor = (manga) =>
  manga?.relationships?.find(r => r.type === 'author')?.attributes?.name || '';

export const coverUrl = (manga, size = 256) => {
  const filename = manga?.relationships?.find(r => r.type === 'cover_art')?.attributes?.fileName;
  return filename
    ? `https://uploads.mangadex.org/covers/${manga.id}/${filename}.${size}.jpg`
    : '/placeholder.png';
};

export const SORT_OPTIONS = [
  { value: 'followedCount', label: 'Most Popular' },
  { value: 'latestUploadedChapter', label: 'Latest Update' },
  { value: 'createdAt', label: 'New Releases' },
  { value: 'relevance', label: 'Relevance' },
];

export const STATUSES = [
  { value: '', label: 'All Status' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'hiatus', label: 'Hiatus' },
];

export async function getTags() {
  const res = await fetch(`${MD_API}/manga/tag`);
  if (!res.ok) return [];
  const { data } = await res.json();
  return data
    .filter(t => t.attributes.group === 'genre')
    .map(t => ({ id: t.id, name: t.attributes.name.en || '' }))
    .filter(t => t.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function browseManga({ query = '', tag = '', status = '', sort = 'followedCount', offset = 0 } = {}) {
  const params = new URLSearchParams({ limit: 24, offset });
  params.append('includes[]', 'cover_art');
  if (query) params.set('title', query);
  if (tag) params.append('includedTags[]', tag);
  if (status) params.set('status', status);
  if (sort) params.set(`order[${sort}]`, 'desc');

  const res = await fetch(`${MD_API}/manga?${params}`);
  if (!res.ok) throw new Error(`MangaDex browse failed: ${res.status}`);
  const json = await res.json();
  return { data: json.data, total: json.total, hasMore: offset + json.data.length < json.total };
}

export async function getMangaById(id) {
  const params = new URLSearchParams();
  ['cover_art', 'author', 'artist'].forEach(t => params.append('includes[]', t));
  const res = await fetch(`${MD_API}/manga/${id}?${params}`);
  if (!res.ok) return null;
  return (await res.json()).data;
}

export async function getMangaChapters(mangaId) {
  const all = [];
  const limit = 500;
  let offset = 0;
  while (true) {
    const params = new URLSearchParams({ limit, offset });
    // No translatedLanguage filter — fetch all languages, filter client-side
    // This avoids MangaDex silently returning 0 for licensed manga with removed EN chapters
    params.set('order[chapter]', 'asc');
    params.append('includes[]', 'scanlation_group');
    ['safe', 'suggestive', 'erotica'].forEach(r => params.append('contentRating[]', r));
    const res = await fetch(`${MD_API}/manga/${mangaId}/feed?${params}`);
    if (!res.ok) {
      console.error(`MangaDex /feed ${res.status} for manga ${mangaId}`);
      break;
    }
    const json = await res.json();
    const data = json.data;
    const total = json.total ?? 0;
    if (!Array.isArray(data)) break;
    // Keep only English chapters — done client-side so we can see what's available
    all.push(...data.filter(ch => ch.attributes?.translatedLanguage === 'en'));
    if (all.length >= total || data.length < limit) break;
    offset += limit;
  }
  return all;
}

export async function getChapter(chapterId) {
  const res = await fetch(`${MD_API}/chapter/${chapterId}`);
  if (!res.ok) return null;
  return (await res.json()).data;
}

export async function getChapterPages(chapterId) {
  const res = await fetch(`${MD_API}/at-home/server/${chapterId}`);
  if (!res.ok) throw new Error(`at-home server failed: ${res.status}`);
  const { baseUrl, chapter } = await res.json();
  return { baseUrl, hash: chapter.hash, data: chapter.data, dataSaver: chapter.dataSaver };
}
