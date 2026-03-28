import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getAnimeKitsuInfo, getKitsuEpisodes } from '../api/kitsu';
import { useAuth } from '../hooks/useAuth';
import { useWatchlist } from '../hooks/useWatchlist';
import LoadingSpinner from '../components/LoadingSpinner';
import EpisodeList from '../components/EpisodeList';

export default function AnimeDetailPage() {
  const { kitsuId } = useParams();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('roomId');
  const { user } = useAuth();
  const { isInWatchlist, toggleWatchlist } = useWatchlist(user?.uid);

  const [anime, setAnime] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const [animeData, eps] = await Promise.all([
          getAnimeKitsuInfo(kitsuId),
          getKitsuEpisodes(kitsuId),
        ]);
        setAnime(animeData);

        if (eps.length > 0) {
          setEpisodes(eps);
        } else {
          // Fallback: generate episode stubs from the episode count
          const count = animeData.episodes || 1;
          setEpisodes(Array.from({ length: count }, (_, i) => ({
            id: `${i + 1}`,
            number: i + 1,
            title: `Episode ${i + 1}`,
            isFiller: false,
          })));
        }
      } catch (err) {
        console.error(err);
        setError('Failed to load anime details.');
      }
      setLoading(false);
    };
    fetchAll();
  }, [kitsuId]);

  if (loading) return <LoadingSpinner fullScreen />;
  if (!anime) return <div className="p-8 text-center text-red-500 font-bold">Failed to load content.</div>;

  const inWatchlist = isInWatchlist(kitsuId);
  const year = anime.startDate?.year;
  const format = anime.format ? anime.format.replace(/_/g, ' ') : null;

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
            </div>

            <p className="text-secondary leading-relaxed mb-6 max-w-3xl font-medium text-sm sm:text-base line-clamp-4 sm:line-clamp-none"
              dangerouslySetInnerHTML={{ __html: anime.description }} />

            <button
              onClick={() => toggleWatchlist({
                contentId: kitsuId, contentType: 'anime',
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
            {!error && <EpisodeList episodes={episodes} animeId={kitsuId} roomId={roomId} />}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
