import { useEffect, useState } from 'react';
import { getTrendingAnime } from '../api/anilist';
import { getTrending, tmdbImage } from '../api/tmdb';
import { useAuth } from '../hooks/useAuth';
import { useHistory } from '../hooks/useHistory';
import ContentCard from '../components/ContentCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { Link } from 'react-router-dom';

export default function HomePage() {
  const { user } = useAuth();
  const { history, loading: historyLoading } = useHistory(user?.uid);
  const [trendingAnime, setTrendingAnime] = useState([]);
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [trendingTV, setTrendingTV] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getTrendingAnime().catch(() => []),
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

  const heroItem = trendingAnime[0]; // Or random featured item

  return (
    <div className="flex flex-col gap-8 pb-10">
      {/* Hero Banner */}
      {heroItem && (
        <div className="relative w-full h-[300px] md:h-[500px] bg-primary">
          <img src={heroItem.bannerImage || heroItem.coverImage?.large} alt="Banner" className="w-full h-full object-cover opacity-80" />
          <div className="absolute inset-0 bg-gradient-to-t from-page via-page/40 to-transparent flex flex-col justify-end p-6 md:p-12">
            <h1 className="text-3xl md:text-5xl font-bold text-primary mb-2 shadow-sm drop-shadow-md">
              {heroItem.title.english || heroItem.title.romaji}
            </h1>
            <p className="text-secondary max-w-2xl line-clamp-2 md:line-clamp-3 mb-6 hidden sm:block bg-page/80 p-2 rounded" dangerouslySetInnerHTML={{ __html: heroItem.description }}></p>
            <div className="flex gap-4">
              <Link to={`/anime/${heroItem.id}`} className="bg-accent-blue hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg shadow-lg flex items-center gap-2 transition-transform hover:scale-105">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                Watch Now
              </Link>
              <Link to={`/anime/${heroItem.id}`} className="bg-surface/90 hover:bg-surface text-primary border border-border font-bold py-2 px-6 rounded-lg shadow-lg transition-transform hover:scale-105">
                More Info
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 md:px-8 space-y-8">
        {/* Continue Watching */}
        {history.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-primary mb-4 border-l-4 border-accent-orange pl-2">Continue Watching</h2>
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 snap-x">
              {history.map(item => (
                <ContentCard key={item.id} id={item.contentId} title={item.title} posterUrl={item.posterUrl} contentType={item.contentType} />
              ))}
            </div>
          </section>
        )}

        {/* Trending Anime */}
        {trendingAnime.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-primary mb-4 border-l-4 border-accent-teal pl-2">Trending Anime</h2>
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 snap-x">
              {trendingAnime.map(anime => (
                <ContentCard key={anime.id} id={anime.id} title={anime.title.english || anime.title.romaji} posterUrl={anime.coverImage?.large} contentType="anime" rating={anime.averageScore ? anime.averageScore / 10 : null} />
              ))}
            </div>
          </section>
        )}

        {/* Trending Movies */}
        {trendingMovies.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-primary mb-4 border-l-4 border-accent-blue pl-2">Trending Movies</h2>
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
            <h2 className="text-xl font-bold text-primary mb-4 border-l-4 border-accent-purple pl-2">Trending TV Shows</h2>
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
