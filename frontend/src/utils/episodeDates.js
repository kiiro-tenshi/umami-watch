export function formatEpisodeDate(value) {
  if (!value) return '';

  // Preserve provider calendar dates exactly. Parsing YYYY-MM-DD as UTC can
  // display the previous day for users west of Greenwich.
  const dateOnly = typeof value === 'string'
    ? value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    : null;
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

export function buildAniListEpisodes(anime, airingSchedule = []) {
  const byEpisode = new Map(
    airingSchedule
      .filter(item => Number.isInteger(item?.episode) && item.episode > 0 && item.airingAt)
      .map(item => [item.episode, item])
  );
  const scheduledCount = Math.max(0, ...byEpisode.keys());
  const nextEpisode = anime?.nextAiringEpisode?.episode || 0;
  const count = anime?.episodes || Math.max(scheduledCount, nextEpisode) || 1;

  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const schedule = byEpisode.get(number);
    return {
      id: String(number),
      number,
      title: `Episode ${number}`,
      airdate: schedule ? new Date(schedule.airingAt * 1000).toISOString() : null,
      isFiller: false,
    };
  });
}
