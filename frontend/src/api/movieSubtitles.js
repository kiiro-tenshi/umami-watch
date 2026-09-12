// The hosted Stremio addon requires no subtitle account or API key.
// TMDB is already configured by the app; it supplies the IMDb identifier only.
export async function findMovieSubtitles(content, workerBase, fetchFn = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const get = async url => {
    const response = await fetchFn(url, { signal: controller.signal });
    if (!response.ok) throw new Error('Subtitle lookup failed');
    return response;
  };
  const proxy = target => {
    const url = new URL(workerBase);
    url.searchParams.set('url', target);
    return url.href;
  };
  try {
    const tmdb = new URL(`https://api.themoviedb.org/3/${content.type}/${content.tmdbId}/external_ids`);
    tmdb.searchParams.set('api_key', import.meta.env.VITE_TMDB_API_KEY);
    const { imdb_id: imdb } = await (await get(tmdb.href)).json();
    if (!/^tt\d+$/.test(imdb || '')) return [];
    const tv = content.type === 'tv';
    const id = tv ? `${imdb}:${content.season || 1}:${content.episode || 1}` : imdb;
    const data = await (await get(proxy(`https://opensubtitles-v3.strem.io/subtitles/${tv ? 'series' : 'movie'}/${id}.json`))).json();
    const seen = new Set();
    const candidates = (data.subtitles || []).filter(sub => {
      if (sub.lang !== 'eng' || !/\.srt$/i.test(sub.subtitleFileName || '') || seen.has(sub.url)) return false;
      if (!/^https:\/\/subs\d*\.strem\.io\//.test(sub.url || '')) return false;
      seen.add(sub.url);
      return true;
    }).slice(0, 3);
    const results = await Promise.allSettled(candidates.map(async (sub, index) => {
      const trackUrl = new URL(proxy(sub.url));
      trackUrl.searchParams.set('subtitle', '1');
      return {
        kind: 'subtitles', srclang: 'en',
        label: `English ${index + 1}`,
        src: trackUrl.href,
      };
    }));
    return results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  } catch {
    return []; // A subtitle outage must never prevent video playback.
  } finally {
    clearTimeout(timeout);
  }
}
