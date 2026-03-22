import { useState, useEffect } from 'react';
import { searchContent, getTrending, getGenres, discoverContent, tmdbImage } from '../api/tmdb';
import ContentCard from '../components/ContentCard';
import LoadingSpinner from '../components/LoadingSpinner';

export default function MovieBrowsePage({ type }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [genres, setGenres] = useState([]);
  const [activeGenre, setActiveGenre] = useState(null);
  const [loading, setLoading] = useState(true);

  const isMovie = type === 'movie';
  const typeLabel = isMovie ? 'Movies' : 'TV Shows';
  
  useEffect(() => {
    setQuery('');
    setActiveGenre(null);
    getGenres(type).then(data => setGenres(data.genres || [])).catch(console.error);
    loadDefault();
  }, [type]);

  const loadDefault = async () => {
    setLoading(true);
    const data = await getTrending(type);
    setResults(data.results || []);
    setLoading(false);
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.trim()) {
        setLoading(true);
        const data = await searchContent(query, type);
        setResults(data.results || []);
        setLoading(false);
      }
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [query, type]);

  const handleGenreClick = async (genreId) => {
    setQuery('');
    if (activeGenre === genreId) {
      setActiveGenre(null);
      return loadDefault();
    }
    setActiveGenre(genreId);
    setLoading(true);
    const data = await discoverContent(type, { with_genres: genreId });
    setResults(data.results || []);
    setLoading(false);
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-primary">Browse <span className={isMovie ? 'text-accent-blue' : 'text-accent-purple'}>{typeLabel}</span></h1>
        <div className="relative w-full md:w-96">
          <input type="text" placeholder={`Search ${typeLabel.toLowerCase()}...`} value={query} onChange={(e) => setQuery(e.target.value)}
            className={`w-full bg-surface p-3 pr-10 rounded-lg border border-border focus:ring-2 focus:outline-none placeholder-muted shadow-sm ${isMovie ? 'focus:ring-accent-blue' : 'focus:ring-accent-purple'}`} />
          <span className="absolute right-3 top-3 text-muted">🔍</span>
        </div>
      </div>

      {!query && genres.length > 0 && (
        <div className="mb-8 overflow-x-auto scrollbar-hide py-2">
          <div className="flex gap-2">
            {genres.map(g => (
              <button key={g.id} onClick={() => handleGenreClick(g.id)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors border ${activeGenre === g.id ? 'text-white ' + (isMovie ? 'bg-accent-blue border-accent-blue' : 'bg-accent-purple border-accent-purple') : 'bg-surface text-secondary border-border hover:bg-surface-raised'}`}>
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {results.map(item => (
            <ContentCard key={item.id} id={item.id} title={isMovie ? item.title : item.name} posterUrl={tmdbImage(item.poster_path)} contentType={type} rating={item.vote_average} className="w-full aspect-[2/3]" />
          ))}
          {results.length === 0 && <p className="col-span-full text-center text-muted p-10 font-medium">No results found.</p>}
        </div>
      )}
    </div>
  );
}
