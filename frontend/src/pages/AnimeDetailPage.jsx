import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getAnimeById } from '../api/anilist';
import { searchAnimeAniwatch, getAniwatchEpisodes } from '../api/aniwatch';

// Normalize title for comparison: lowercase, strip brackets/punctuation,
// convert ordinals ("3rd Season" → "season 3")
function normalizeTitle(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[[\]]/g, '')                                          // strip bracket chars, keep content
    .replace(/[^\w\s]/g, ' ')                                       // remove other punctuation
    .replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/gi, 'season $1')  // "3rd Season" → "season 3"
    .replace(/\s+/g, ' ')
    .trim();
}

// Score each HiAnime search result against the AniList title + episode count
// Uses Jaccard word-set similarity — avoids false positives from short substring matches
function bestAniwatchMatch(animes, title, episodeCount) {
  if (!animes?.length) return null;
  const query = normalizeTitle(title);
  const queryWords = new Set(query.split(' ').filter(Boolean));

  // Meaningful content words — exclude common stop words that cause false positives
  const STOP = new Set(['no', 'the', 'a', 'an', 'of', 'in', 'to', 'and', 'or', 'wa', 'ga', 'wo']);
  const queryContent = [...queryWords].filter(w => !STOP.has(w));

  let best = null;
  let bestScore = -1;

  for (let i = 0; i < animes.length; i++) {
    const anime = animes[i];
    const name = normalizeTitle(anime.name);
    const nameWords = new Set(name.split(' ').filter(Boolean));

    let score = 0;

    if (name === query) {
      score = 10000;
    } else {
      // Jaccard on content words only (ignores "no", "the", etc.)
      const nameContent = [...nameWords].filter(w => !STOP.has(w));
      const intersection = queryContent.filter(w => nameWords.has(w)).length;
      const unionSize = new Set([...queryContent, ...nameContent]).size || 1;
      score = Math.round((intersection / unionSize) * 100);

      // Bonus when full query appears inside the result name
      if (name.includes(query)) score += 300;

      // Bonus when all content query words are present
      if (queryContent.length > 0 && queryContent.every(w => nameWords.has(w))) score += 150;
    }

    // Episode count tiebreaker
    if (episodeCount && anime.episodes?.sub) {
      if (anime.episodes.sub === episodeCount) score += 100;
      else if (Math.abs(anime.episodes.sub - episodeCount) <= 2) score += 20;
    }

    // Slight position penalty so earlier results win ties
    score -= i * 0.5;

    if (score > bestScore) {
      bestScore = score;
      best = anime;
    }
  }

  // Minimum threshold — reject weak matches to avoid false positives like "No 6"
  const MIN_SCORE = 30;
  return bestScore >= MIN_SCORE ? best : null;
}
import { useAuth } from '../hooks/useAuth';
import { useWatchlist } from '../hooks/useWatchlist';
import LoadingSpinner from '../components/LoadingSpinner';
import EpisodeList from '../components/EpisodeList';

export default function AnimeDetailPage() {
  const { anilistId } = useParams();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('roomId');
  const { user } = useAuth();
  const { isInWatchlist, toggleWatchlist } = useWatchlist(user?.uid);

  const [anime, setAnime] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [episodeSource, setEpisodeSource] = useState('generated'); // 'aniwatch' | 'generated'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getAnimeById(anilistId);
        setAnime(data);

        const titleEn = data.title?.english || '';
        const titleRomaji = data.title?.romaji || '';
        const title = titleEn || titleRomaji;

        // Try to get real episodes from aniwatch-api (HiAnime)
        // Search with English title first, then romaji as fallback
        let fetchedEps = null;
        try {
          const titlesToTry = [...new Set([titleEn, titleRomaji].filter(Boolean))];
          let topHit = null;

          for (const t of titlesToTry) {
            const searchRes = await searchAnimeAniwatch(t);
            topHit = bestAniwatchMatch(searchRes?.data?.animes, t, data.episodes);
            if (topHit) break;
          }

          if (topHit?.id) {
            const epsRes = await getAniwatchEpisodes(topHit.id);
            if (epsRes?.data?.episodes?.length > 0) {
              fetchedEps = epsRes.data.episodes.map(ep => ({
                id: ep.episodeId,
                number: ep.number,
                title: ep.title || `Episode ${ep.number}`,
                isFiller: ep.isFiller || false,
              }));
              setEpisodeSource('aniwatch');
            }
          }
        } catch (e) {
          console.warn('[AnimeDetail] aniwatch episode fetch failed, using fallback:', e.message);
        }

        if (fetchedEps) {
          setEpisodes(fetchedEps);
        } else {
          // Fallback: generate episode numbers from AniList episode count
          let count = data.episodes;
          if (!count) {
            count = data.nextAiringEpisode?.episode
              ? Math.max(1, data.nextAiringEpisode.episode - 1)
              : 24;
          }
          setEpisodes(Array.from({ length: count }, (_, i) => ({
            id: `${i + 1}`,
            number: i + 1,
            title: `Episode ${i + 1}`,
            isFiller: false,
          })));
          setEpisodeSource('generated');
        }
      } catch (err) {
        console.error(err);
        setError('Failed to load anime details.');
      }
      setLoading(false);
    };
    fetchAll();
  }, [anilistId]);

  if (loading) return <LoadingSpinner fullScreen />;
  if (!anime) return <div className="p-8 text-center text-red-500 font-bold">Failed to load content.</div>;

  const inWatchlist = isInWatchlist(anilistId);
  const studio = anime.studios?.nodes?.[0]?.name;
  const year = anime.startDate?.year;
  const format = anime.format ? anime.format.replace(/_/g, ' ') : null;
  const trailer = anime.trailer?.site === 'YouTube' ? anime.trailer : null;
  const daysUntilAiring = anime.nextAiringEpisode
    ? Math.floor(anime.nextAiringEpisode.timeUntilAiring / 86400)
    : null;

  return (
    <div className="pb-12">
      {/* Room banner */}
      {roomId && (
        <div className="bg-accent-teal/10 border-b border-accent-teal/30 px-4 py-3 flex items-center gap-3 text-sm font-semibold text-accent-teal">
          <span>🎬</span>
          <span>You're setting up a Watch Party room. Pick an episode below to start streaming with friends.</span>
        </div>
      )}
      {/* Banner */}
      <div className="relative w-full h-[180px] sm:h-[250px] md:h-[400px] bg-primary">
        <img src={anime.bannerImage || anime.coverImage?.large} alt="Banner" className="w-full h-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-page via-page/60 to-transparent" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 -mt-16 sm:-mt-24 md:-mt-32 relative z-10">
        {/* Hero card */}
        <div className="flex flex-col md:flex-row gap-4 md:gap-8 bg-surface p-4 sm:p-6 rounded-2xl shadow-xl border border-border">
          <div className="w-28 sm:w-40 md:w-64 shrink-0 mx-auto md:mx-0">
            <img src={anime.coverImage?.large} alt="Poster" className="w-full rounded-xl shadow-lg border border-border-subtle" />
          </div>

          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-primary mb-1">{anime.title.english || anime.title.romaji}</h1>
            {anime.title.romaji && anime.title.english && (
              <p className="text-muted font-semibold text-sm mb-1">{anime.title.romaji}</p>
            )}
            {studio && <p className="text-secondary font-semibold text-sm mb-4">{studio}</p>}

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="bg-accent-teal text-white px-2.5 py-1 rounded text-sm font-bold shadow-sm">{anime.status}</span>
              {format && <span className="bg-surface-raised border border-border text-secondary px-2.5 py-1 rounded text-sm font-semibold capitalize">{format}</span>}
              {year && <span className="bg-surface-raised border border-border text-secondary px-2.5 py-1 rounded text-sm font-semibold">{year}</span>}
              {anime.averageScore && (
                <span className="text-amber-500 font-bold bg-amber-50 px-2.5 py-1 border border-amber-200 rounded">
                  ★ {(anime.averageScore / 10).toFixed(1)}
                </span>
              )}
              <span className="text-secondary font-medium text-sm">{anime.episodes ? `${anime.episodes} Episodes` : 'Ongoing'}</span>
              {anime.nextAiringEpisode && (
                <span className="bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1 rounded text-sm font-semibold">
                  EP {anime.nextAiringEpisode.episode} in {daysUntilAiring}d
                </span>
              )}
              {episodeSource === 'aniwatch' && (
                <span className="bg-green-50 border border-green-200 text-green-700 px-2.5 py-1 rounded text-xs font-semibold">
                  ✓ HiAnime Episodes
                </span>
              )}
            </div>

            {/* Genres */}
            <div className="flex flex-wrap gap-2 mb-5">
              {anime.genres?.map(g => (
                <span key={g} className="text-xs text-muted border border-border px-2 py-0.5 rounded-full">{g}</span>
              ))}
            </div>

            <p className="text-secondary leading-relaxed mb-6 max-w-3xl font-medium text-sm sm:text-base line-clamp-4 sm:line-clamp-none"
              dangerouslySetInnerHTML={{ __html: anime.description }} />

            <button
              onClick={() => toggleWatchlist({
                contentId: anilistId, contentType: 'anime',
                title: anime.title.english || anime.title.romaji,
                posterUrl: anime.coverImage?.large
              })}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold shadow-md transition-transform hover:scale-105 border ${inWatchlist ? 'bg-surface border-border text-red-600' : 'bg-surface-raised border-border text-primary'}`}
            >
              <span className="text-xl">{inWatchlist ? '♥️' : '♡'}</span>
              {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-8 bg-amber-50 border-l-4 border-amber-500 text-amber-800 p-4 rounded shadow-sm font-medium">
            <strong>Notice:</strong> {error}
          </div>
        )}

        {/* Content grid */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 flex flex-col gap-8">
            {!error && <EpisodeList episodes={episodes} animeId={anilistId} roomId={roomId} />}

            {trailer && (
              <div>
                <h2 className="text-2xl font-bold text-primary mb-4">Trailer</h2>
                <div className="aspect-video rounded-xl overflow-hidden shadow-lg border border-border">
                  <iframe
                    className="w-full h-full"
                    src={`https://www.youtube.com/embed/${trailer.id}`}
                    allowFullScreen
                    allow="autoplay; encrypted-media"
                    title="Trailer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Info sidebar */}
          <div className="bg-surface rounded-xl p-6 border border-border shadow-sm h-fit">
            <h3 className="font-bold text-primary text-xl mb-4 border-b border-border pb-2">Information</h3>
            <div className="space-y-4 text-sm">
              {format && (
                <div>
                  <p className="text-muted font-semibold uppercase tracking-wider mb-1">Format</p>
                  <p className="text-primary font-medium capitalize">{format}</p>
                </div>
              )}
              {year && (
                <div>
                  <p className="text-muted font-semibold uppercase tracking-wider mb-1">Year</p>
                  <p className="text-primary font-medium">{year}</p>
                </div>
              )}
              {studio && (
                <div>
                  <p className="text-muted font-semibold uppercase tracking-wider mb-1">Studio</p>
                  <p className="text-primary font-medium">{studio}</p>
                </div>
              )}
              <div>
                <p className="text-muted font-semibold uppercase tracking-wider mb-1">Status</p>
                <p className="text-primary font-medium">{anime.status}</p>
              </div>
              {anime.episodes && (
                <div>
                  <p className="text-muted font-semibold uppercase tracking-wider mb-1">Episodes</p>
                  <p className="text-primary font-medium">{anime.episodes}</p>
                </div>
              )}
              {anime.genres?.length > 0 && (
                <div>
                  <p className="text-muted font-semibold uppercase tracking-wider mb-2">Genres</p>
                  <div className="flex flex-wrap gap-2">
                    {anime.genres.map(g => (
                      <span key={g} className="bg-surface-raised border border-border text-xs px-2 py-1 rounded font-medium text-secondary">{g}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
