export function resumePosition(item, type, season = 1, episode = 1) {
  if (!item || (item.contentType && item.contentType !== type)) return 0;
  if (type === 'tv' && (Number(item.seasonNum || 1) !== Number(season || 1)
    || Number(item.episodeNum || 1) !== Number(episode || 1))) return 0;
  const position = Number(item.position);
  const duration = Number(item.duration);
  return Number.isFinite(position) && Number.isFinite(duration) && position >= 5
    && duration > 0 && position < duration * 0.95 ? position : 0;
}

export function nextAiredEpisode(episodes, after, season, today = new Date().toISOString().slice(0, 10)) {
  const next = [...(episodes || [])].sort((a, b) => a.episode_number - b.episode_number)
    .find(ep => ep.episode_number > after && ep.air_date && ep.air_date <= today);
  return next ? { season, episode: next.episode_number, name: next.name } : null;
}
