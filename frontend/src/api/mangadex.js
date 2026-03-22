const BASE = `${import.meta.env.VITE_API_BASE_URL}/api/proxy/mangadex`;

const mdFetch = async (path, params = {}) => {
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach(item => url.searchParams.append(k, item));
    else url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`MangaDex error: ${res.status}`);
  return res.json();
};

// Cover art URL helper — proxied through server to add required Referer header
export const coverUrl = (mangaId, filename, size = 256) => {
  const raw = `https://uploads.mangadex.org/covers/${mangaId}/${filename}.${size}.jpg`;
  return `${import.meta.env.VITE_API_BASE_URL}/api/proxy/mangadex-cover?url=${encodeURIComponent(raw)}`;
};

// Extract cover filename from manga relationships
export const getCoverFilename = (manga) => {
  const rel = manga.relationships?.find(r => r.type === 'cover_art');
  return rel?.attributes?.fileName || null;
};

// Extract author name from relationships
export const getAuthor = (manga) => {
  const rel = manga.relationships?.find(r => r.type === 'author');
  return rel?.attributes?.name || null;
};

// Get localized title (prefer en, fallback to first available)
export const getTitle = (manga) => {
  const t = manga.attributes?.title;
  return t?.en || t?.['ja-ro'] || t?.ja || Object.values(t || {})[0] || 'Unknown Title';
};

export const getDescription = (manga) => {
  const d = manga.attributes?.description;
  return d?.en || Object.values(d || {})[0] || '';
};

export const getTrendingManga = async (limit = 20, offset = 0) => {
  const data = await mdFetch('/manga', {
    limit,
    offset,
    'order[followedCount]': 'desc',
    'includes[]': ['cover_art', 'author'],
    'contentRating[]': ['safe', 'suggestive'],
    'availableTranslatedLanguage[]': ['en'],
  });
  return data.data || [];
};

export const searchManga = async (title, limit = 20, offset = 0) => {
  const data = await mdFetch('/manga', {
    title,
    limit,
    offset,
    'includes[]': ['cover_art', 'author'],
    'contentRating[]': ['safe', 'suggestive'],
    'availableTranslatedLanguage[]': ['en'],
  });
  return data.data || [];
};

export const getMangaByGenre = async (tagId, limit = 20, offset = 0) => {
  const data = await mdFetch('/manga', {
    limit,
    offset,
    'includedTags[]': [tagId],
    'order[followedCount]': 'desc',
    'includes[]': ['cover_art', 'author'],
    'contentRating[]': ['safe', 'suggestive'],
    'availableTranslatedLanguage[]': ['en'],
  });
  return data.data || [];
};

export const getMangaById = async (id) => {
  const data = await mdFetch(`/manga/${id}`, {
    'includes[]': ['cover_art', 'author', 'artist'],
  });
  return data.data;
};

export const getMangaTags = async () => {
  const data = await mdFetch('/manga/tag');
  return (data.data || []).filter(t => t.attributes?.group === 'genre');
};

export const getMangaChapters = async (mangaId, offset = 0, limit = 100) => {
  const data = await mdFetch(`/manga/${mangaId}/feed`, {
    'translatedLanguage[]': ['en'],
    'order[chapter]': 'asc',
    limit,
    offset,
    'includes[]': ['scanlation_group'],
  });
  return { data: data.data || [], total: data.total || 0 };
};

export const getChapterPages = async (chapterId) => {
  const data = await mdFetch(`/at-home/server/${chapterId}`);
  return {
    baseUrl: data.baseUrl,
    hash: data.chapter?.hash,
    data: data.chapter?.data || [],
    dataSaver: data.chapter?.dataSaver || [],
  };
};
