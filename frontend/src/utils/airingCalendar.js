function normalizeTitle(value) {
  return (value || '')
    .replace(/\s*[—–-]\s*Episode\s*\d+.*$/i, '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function getCurrentlyWatchingLookup(items) {
  const anilistIds = new Set();
  const titles = new Set();

  for (const item of items || []) {
    if (item?.contentType !== 'anime') continue;
    if (item.contentSource === 'anilist' && item.contentId != null) {
      anilistIds.add(String(item.contentId));
    }
    const title = normalizeTitle(item.title);
    if (title) titles.add(title);
  }

  return { anilistIds, titles };
}

export function prioritizeAiringSchedules(schedules, currentlyWatching, limit = 5) {
  const { anilistIds, titles } = getCurrentlyWatchingLookup(currentlyWatching);

  return (schedules || [])
    .map(schedule => {
      const mediaTitles = [schedule.media?.title?.english, schedule.media?.title?.romaji]
        .map(normalizeTitle)
        .filter(Boolean);
      const isCurrentlyWatching = anilistIds.has(String(schedule.media?.id))
        || mediaTitles.some(title => titles.has(title));
      return { ...schedule, isCurrentlyWatching };
    })
    .sort((a, b) => {
      if (a.isCurrentlyWatching !== b.isCurrentlyWatching) {
        return a.isCurrentlyWatching ? -1 : 1;
      }
      return (b.media?.popularity || 0) - (a.media?.popularity || 0);
    })
    .slice(0, limit);
}
