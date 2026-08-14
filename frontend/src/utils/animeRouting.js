export function normalizeAnimeSource(source) {
  return source === 'anilist' ? 'anilist' : 'kitsu';
}

export function buildAnimeWatchUrl({ animeId, epNum, roomId, animeSource }) {
  const params = new URLSearchParams({
    type: 'anime',
    kitsuId: String(animeId),
    epNum: String(epNum),
  });
  const source = normalizeAnimeSource(animeSource);
  if (source !== 'kitsu') params.set('animeSource', source);
  if (roomId) params.set('roomId', roomId);
  return `/watch?${params.toString()}`;
}

export function getAnimeHistoryKey(animeId, epNum, animeSource) {
  const source = normalizeAnimeSource(animeSource);
  return `anime_${source}${animeId}_ep${epNum}`;
}

export function findExactAnimeTitleMatch(results, title) {
  const normalize = value => (value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  const expected = normalize(title);
  if (!expected) return null;
  return results.find(item =>
    [item.title?.english, item.title?.romaji].some(candidate => normalize(candidate) === expected)
  ) || null;
}
