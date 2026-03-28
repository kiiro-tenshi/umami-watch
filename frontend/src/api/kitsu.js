const KITSU_BASE = 'https://kitsu.io/api/edge';

// Normalize a raw Kitsu API item to the shape used by our components
function normalizeAnime(item) {
  const attrs = item.attributes;
  return {
    id: item.id,
    title: {
      english: attrs.titles?.en || attrs.canonicalTitle || null,
      romaji:  attrs.titles?.en_jp || attrs.titles?.ja_jp || null,
    },
    coverImage: { large: attrs.posterImage?.large || attrs.posterImage?.original || null },
    bannerImage: attrs.coverImage?.original || attrs.coverImage?.large || null,
    description: attrs.synopsis || null,
    episodes: attrs.episodeCount || null,
    // averageRating is "80.64" (0–100); components divide by 10 to show "8.1"
    averageScore: attrs.averageRating ? Math.round(parseFloat(attrs.averageRating)) : null,
    status: attrs.status ? attrs.status.charAt(0).toUpperCase() + attrs.status.slice(1) : null,
    format: attrs.subtype || null,
    startDate: attrs.startDate ? { year: new Date(attrs.startDate).getFullYear() } : null,
    genres: [],  // Requires a separate Kitsu categories call; left empty for now
    studios: { nodes: [] }, // Not available in base Kitsu query
    nextAiringEpisode: null,
    trailer: null,
  };
}

export const searchAnimeKitsu = async (query) => {
  const res = await fetch(
    `${KITSU_BASE}/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=20&fields[anime]=id,canonicalTitle,titles,posterImage,coverImage,episodeCount,status,synopsis,averageRating,subtype,startDate`
  );
  if (!res.ok) throw new Error(`Kitsu search failed: ${res.status}`);
  const data = await res.json();
  return (data.data || []).map(normalizeAnime);
};

export const getTrendingKitsu = async () => {
  const res = await fetch(
    `${KITSU_BASE}/anime?sort=-userCount&page[limit]=20&fields[anime]=id,canonicalTitle,titles,posterImage,coverImage,episodeCount,status,synopsis,averageRating,subtype,startDate`
  );
  if (!res.ok) throw new Error(`Kitsu trending failed: ${res.status}`);
  const data = await res.json();
  return (data.data || []).map(normalizeAnime);
};

export const getAnimeKitsuInfo = async (kitsuId) => {
  const res = await fetch(
    `${KITSU_BASE}/anime/${kitsuId}?fields[anime]=id,canonicalTitle,titles,synopsis,posterImage,coverImage,episodeCount,status,startDate,endDate,averageRating,ageRating,subtype`
  );
  if (!res.ok) throw new Error(`Kitsu info failed: ${res.status}`);
  const data = await res.json();
  return normalizeAnime(data.data);
};

export const getKitsuEpisodes = async (kitsuId) => {
  const episodes = [];
  let offset = 0;
  const limit = 20;

  while (true) {
    const res = await fetch(
      `${KITSU_BASE}/anime/${kitsuId}/episodes?page[limit]=${limit}&page[offset]=${offset}&fields[episodes]=number,canonicalTitle`
    );
    if (!res.ok) break;
    const data = await res.json();
    const batch = data.data || [];
    episodes.push(...batch);
    if (!data.links?.next || batch.length < limit) break;
    offset += limit;
  }

  return episodes.map(ep => ({
    id: ep.id,
    number: ep.attributes.number,
    title: ep.attributes.canonicalTitle || `Episode ${ep.attributes.number}`,
    isFiller: false,
  }));
};

export const getKitsuCategories = async () => {
  const res = await fetch(`${KITSU_BASE}/categories?page[limit]=50&sort=-totalMediaCount`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data || []).map(c => c.attributes.title);
};

export const discoverKitsuByCategory = async (categoryTitle) => {
  const res = await fetch(
    `${KITSU_BASE}/anime?filter[categories]=${encodeURIComponent(categoryTitle)}&sort=-userCount&page[limit]=20&fields[anime]=id,canonicalTitle,titles,posterImage,coverImage,episodeCount,status,synopsis,averageRating,subtype,startDate`
  );
  if (!res.ok) throw new Error(`Kitsu category fetch failed: ${res.status}`);
  const data = await res.json();
  return (data.data || []).map(normalizeAnime);
};
