import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getMovieDetail, getTVDetail, getTVSeason, tmdbImage } from '../api/tmdb';
import { useAuth } from '../hooks/useAuth';
import { useWatchlist } from '../hooks/useWatchlist';
import LoadingSpinner from '../components/LoadingSpinner';
import SeasonSelector from '../components/SeasonSelector';
import { Link } from 'react-router-dom';

export default function MovieDetailPage({ type }) {
  const { tmdbId } = useParams();
  const { user } = useAuth();
  const { isInWatchlist, toggleWatchlist } = useWatchlist(user?.uid);
  
  const [data, setData] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonEpisodes, setSeasonEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);

  const isMovie = type === 'movie';
  const title = data ? (isMovie ? data.title : data.name) : '';

  useEffect(() => {
    const fetchDetail = async () => {
      setLoading(true);
      try {
        const res = isMovie ? await getMovieDetail(tmdbId) : await getTVDetail(tmdbId);
        setData(res);
        if (!isMovie && res.seasons?.length > 0) {
          const firstRealSeason = res.seasons.find(s => s.season_number > 0) || res.seasons[0];
          setSelectedSeason(firstRealSeason.season_number);
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    fetchDetail();
  }, [tmdbId, isMovie]);

  useEffect(() => {
    if (!isMovie && data && selectedSeason !== null) {
      getTVSeason(tmdbId, selectedSeason).then(res => setSeasonEpisodes(res.episodes || []));
    }
  }, [tmdbId, selectedSeason, isMovie, data]);

  if (loading) return <LoadingSpinner fullScreen />;
  if (!data) return <div className="p-8 text-center text-red-500 font-bold">Failed to load content.</div>;

  const inWatchlist = isInWatchlist(tmdbId);
  const trailer = data.videos?.results?.find(v => v.site === 'YouTube' && v.type === 'Trailer');

  return (
    <div className="pb-12">
      <div className="relative w-full h-[300px] md:h-[500px] bg-primary">
        <img src={tmdbImage(data.backdrop_path, 'original')} alt="Banner" className="w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-t from-page via-page/70 to-transparent"></div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 -mt-32 sm:-mt-48 relative z-10">
        <div className="flex flex-col md:flex-row gap-6 md:gap-8">
          <div className="w-48 md:w-72 shrink-0 mx-auto md:mx-0">
            <img src={tmdbImage(data.poster_path)} alt="Poster" className="w-full rounded-2xl shadow-2xl border border-border" />
          </div>

          <div className="flex-1 pt-4 md:pt-16">
            <h1 className="text-4xl md:text-6xl font-bold text-primary mb-3 shadow-sm">{title}</h1>
            {data.tagline && <p className="text-lg text-secondary italic mb-4 font-medium border-l-4 border-accent-blue pl-3">&quot;{data.tagline}&quot;</p>}

            <div className="flex flex-wrap items-center gap-3 mb-6 font-semibold">
              <span className={`${isMovie ? 'bg-accent-blue' : 'bg-accent-purple'} text-white px-2.5 py-1 rounded shadow-sm text-sm uppercase`}>{type}</span>
              {data.vote_average > 0 && <span className="text-amber-600 bg-amber-50 px-2.5 py-1 rounded shadow-sm border border-amber-200">★ {data.vote_average.toFixed(1)}</span>}
              <span className="text-secondary bg-surface border border-border px-2.5 py-1 rounded shadow-sm">
                {isMovie ? (data.release_date?.substring(0,4)) : (data.first_air_date?.substring(0,4))}
              </span>
              {isMovie && data.runtime && <span className="text-secondary border border-border px-2 py-1 rounded text-sm">{data.runtime}m</span>}
            </div>

            <p className="text-secondary leading-relaxed mb-8 max-w-3xl text-lg">{data.overview}</p>

            <div className="flex flex-wrap gap-4 mb-8">
              {isMovie && (
                <Link to={`/watch?type=movie&tmdbId=${tmdbId}`} className="bg-accent-blue hover:bg-red-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg flex items-center gap-2 transition-transform hover:scale-105 text-lg">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  Watch Movie
                </Link>
              )}
              <button onClick={() => toggleWatchlist({
                contentId: tmdbId, contentType: type, title, posterUrl: tmdbImage(data.poster_path)
              })}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold shadow-md transition-transform hover:scale-105 border ${inWatchlist ? 'bg-surface border-border text-red-600' : 'bg-surface-raised border-border text-primary'}`}>
                <span className="text-xl">{inWatchlist ? '♥️' : '♡'}</span>
                {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
              </button>
            </div>
          </div>
        </div>

        {/* Content sections */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-8 border-t border-border pt-8">
          <div className="lg:col-span-2">
            {!isMovie && (
              <SeasonSelector seasons={data.seasons} selectedSeason={selectedSeason} onSeasonChange={setSelectedSeason} episodes={seasonEpisodes} tmdbId={tmdbId} />
            )}
            
            {trailer && (
               <div className="mt-8">
                 <h2 className="text-2xl font-bold text-primary mb-4">Trailer</h2>
                 <div className="aspect-video rounded-xl overflow-hidden shadow-lg border border-border">
                   <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${trailer.key}`} allowFullScreen></iframe>
                 </div>
               </div>
            )}
          </div>
          
          <div className="bg-surface rounded-xl p-6 border border-border shadow-sm h-fit">
            <h3 className="font-bold text-primary text-xl mb-4 border-b border-border pb-2">Information</h3>
            <div className="space-y-4">
              <div>
                <p className="text-muted text-sm font-semibold uppercase tracking-wider mb-1">Genres</p>
                <div className="flex flex-wrap gap-2">
                  {data.genres?.map(g => <span key={g.id} className="bg-surface-raised border border-border text-xs px-2 py-1 rounded font-medium text-secondary">{g.name}</span>)}
                </div>
              </div>
              {data.credits?.cast?.length > 0 && (
                <div>
                  <p className="text-muted text-sm font-semibold uppercase tracking-wider mb-2 mt-4">Top Cast</p>
                  <div className="flex flex-col gap-3">
                    {data.credits.cast.slice(0, 5).map(c => (
                      <div key={c.id} className="flex flex-row items-center gap-3">
                         <img src={tmdbImage(c.profile_path, 'w185')} className="w-10 h-10 rounded-full object-cover border border-border shadow-sm bg-surface-raised" alt="" />
                         <div>
                           <p className="text-sm font-bold text-primary leading-tight">{c.name}</p>
                           <p className="text-xs text-muted truncate w-40">{c.character}</p>
                         </div>
                      </div>
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
