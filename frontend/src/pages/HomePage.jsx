import { useEffect, useMemo, useState } from 'react';
import { getSeasonalTrendingAnime, getCurrentSeasonLabel } from '../api/anilist';
import { getTrending, tmdbImage } from '../api/tmdb';
import { useAuth } from '../hooks/useAuth';
import { useHistory } from '../hooks/useHistory';
import { getContinueWatchingItems } from './homeContinueWatching';
import ContentCard from '../components/ContentCard';
import LoadingSpinner from '../components/LoadingSpinner';
import AiringCalendar from '../components/AiringCalendar';
import { Link } from 'react-router-dom';

export default function HomePage() {
  const { user } = useAuth();
  const { history, loading: historyLoading } = useHistory(user?.uid);
  const [trendingAnime, setTrendingAnime] = useState([]);
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [trendingTV, setTrendingTV] = useState([]);
  const [loading, setLoading] = useState(true);
  const continueWatching = useMemo(
    () => getContinueWatchingItems(history),
    [history]
  );

  useEffect(() => {
    Promise.all([
      getSeasonalTrendingAnime().catch(() => []),
      getTrending('movie').catch(() => ({ results: [] })),
      getTrending('tv').catch(() => ({ results: [] }))
    ]).then(([animeData, movieData, tvData]) => {
      setTrendingAnime(animeData || []);
      setTrendingMovies(movieData.results || []);
      setTrendingTV(tvData.results || []);
      setLoading(false);
    });
  }, []);

  if (loading || historyLoading) return <LoadingSpinner fullScreen />;

  return (
    <div className="flex flex-col gap-8 pb-10">
      {/* PIW motto */}
      <div className="text-center py-2 bg-surface-raised border-b border-border-subtle">
        <p className="text-xs text-muted font-semibold tracking-wide">{user?.displayName ? `Hi, ${user.displayName.split(' ')[0]}! ` : ''}Keep your watch history Pure, Innocent, and Wholesome <span className="text-primary font-bold">(PIW)</span></p>
      </div>

      <div className="px-4 md:px-8 space-y-8">
        {/* Airing Calendar */}
        <section>
          <AiringCalendar currentlyWatching={continueWatching} />
        </section>
        {/* Continue Watching */}
        {continueWatching.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-primary mb-4 border-l-4 border-accent-orange pl-2">Continue Watching</h2>
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 snap-x">
              {continueWatching.map(item => (
                <ContentCard
                  key={item.id}
                  id={item.contentId}
                  title={item.title}
                  posterUrl={item.posterUrl}
                  contentType={item.contentType}
                  progress={item.progress}
                  continueUrl={item.continueUrl}
                />
              ))}
            </div>
          </section>
        )}

        {/* Trending Anime */}
        {trendingAnime.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-primary border-l-4 border-accent-teal pl-2">Trending Anime — {getCurrentSeasonLabel()}</h2>
              <Link to="/anime" className="text-sm font-semibold text-accent-teal hover:underline">View More →</Link>
            </div>
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 snap-x">
              {trendingAnime.map(anime => (
                <ContentCard key={anime.id} id={anime.id} title={anime.title.english || anime.title.romaji} posterUrl={anime.coverImage?.large} contentType="anime" rating={anime.averageScore ? anime.averageScore / 10 : null} source="anilist" />
              ))}
            </div>
          </section>
        )}

        {/* Trending Movies */}
        {trendingMovies.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-primary border-l-4 border-accent-blue pl-2">Trending Movies</h2>
              <Link to="/movies" className="text-sm font-semibold text-accent-blue hover:underline">View More →</Link>
            </div>
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 snap-x">
              {trendingMovies.map(movie => (
                <ContentCard key={movie.id} id={movie.id} title={movie.title} posterUrl={tmdbImage(movie.poster_path)} contentType="movie" rating={movie.vote_average} />
              ))}
            </div>
          </section>
        )}

        {/* Trending TV Shows */}
        {trendingTV.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-primary border-l-4 border-accent-purple pl-2">Trending TV Shows</h2>
              <Link to="/tv" className="text-sm font-semibold text-accent-purple hover:underline">View More →</Link>
            </div>
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 snap-x">
              {trendingTV.map(tv => (
                <ContentCard key={tv.id} id={tv.id} title={tv.name} posterUrl={tmdbImage(tv.poster_path)} contentType="tv" rating={tv.vote_average} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
