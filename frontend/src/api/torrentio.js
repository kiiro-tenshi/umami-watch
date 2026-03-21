export const getTorrentioStreams = async (type, externalId, season, episode, absoluteEpisode=null) => {
  if (!externalId) throw new Error("ID is required for Torrentio streams.");

  let url;
  if (type === 'movie') {
    url = `https://torrentio.strem.fun/stream/movie/${externalId}.json`;
  } else if (type === 'tv' && season && episode) {
    url = `https://torrentio.strem.fun/stream/series/${externalId}:${season}:${episode}.json`;
  } else if (type === 'anime') {
    // For anime, externalId is the Kitsu ID. Absolute episode required for Kitsu arrays.
    url = `https://torrentio.strem.fun/stream/anime/kitsu:${externalId}:${absoluteEpisode || 1}.json`;
  } else {
    throw new Error('Invalid parameters for Torrentio streams.');
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Torrentio API error');
    const data = await res.json();
    return data.streams || [];
  } catch (err) {
    console.error("Torrentio Error:", err);
    return [];
  }
};
