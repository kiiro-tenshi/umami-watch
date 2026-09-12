import { buildAnimeWatchUrl, normalizeAnimeSource } from '../utils/animeRouting';

const WATCHED_THRESHOLD = 0.85;

export function isHistoryItemComplete(item) {
  if (item.manuallyWatched === false) return false;
  if (item.manuallyWatched === true) return true;

  const position = Number(item.position);
  const duration = Number(item.duration);
  return Number.isFinite(position)
    && Number.isFinite(duration)
    && duration > 0
    && position >= duration * (['movie', 'tv'].includes(item.contentType) ? 0.95 : WATCHED_THRESHOLD);
}

function getProgress(item) {
  const position = Number(item.position);
  const duration = Number(item.duration);
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0 || position < 0) {
    return null;
  }
  return Math.min(100, Math.round((position / duration) * 100));
}

function getContinueUrl(item, complete) {
  if (item.contentType === 'anime') {
    const currentEpisode = Number(item.epNum) || 1;
    const episode = complete ? currentEpisode + 1 : currentEpisode;
    return buildAnimeWatchUrl({ animeId: item.contentId, epNum: episode, animeSource: item.contentSource });
  }

  if (item.contentType === 'movie') {
    return `/watch?type=movie&tmdbId=${item.contentId}`;
  }

  if (item.contentType === 'tv') {
    const season = complete ? item.nextSeasonNum : item.seasonNum;
    const episode = complete ? item.nextEpisodeNum : item.episodeNum;
    if (complete && (!season || !episode)) return null;
    return `/watch?type=tv&tmdbId=${item.contentId}&season=${season || 1}&episode=${episode || 1}`;
  }

  return null;
}

export function getContinueWatchingItems(history) {
  const seenAnime = new Set();
  const seenMedia = new Set();

  return history.flatMap(item => {
    const complete = isHistoryItemComplete(item);

    if (item.contentType === 'anime') {
      const animeId = `${normalizeAnimeSource(item.contentSource)}:${item.contentId}`;
      if (seenAnime.has(animeId)) return [];
      seenAnime.add(animeId);
    } else {
      const key = `${item.contentType}:${item.contentId}`;
      if (seenMedia.has(key)) return [];
      seenMedia.add(key);
      if (complete && item.contentType !== 'tv') return [];
    }

    const continueUrl = getContinueUrl(item, complete);
    if (!continueUrl) return [];

    return [{
      ...item,
      progress: complete ? null : getProgress(item),
      continueUrl,
    }];
  });
}
