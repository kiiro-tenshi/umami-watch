import { useState, useEffect } from 'react';
import { searchAnimeKitsu, getTrendingKitsu, getKitsuCategories, discoverKitsuByCategory } from '../api/kitsu';
import ContentCard from '../components/ContentCard';
import LoadingSpinner from '../components/LoadingSpinner';

export default function AnimeBrowsePage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [genres, setGenres] = useState([]);
  const [activeGenre, setActiveGenre] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getKitsuCategories().then(setGenres).catch(console.error);
    loadDefault();
  }, []);

  const loadDefault = async () => {
    setLoading(true);
    const data = await getTrendingKitsu().catch(() => []);
    setResults(data || []);
    setLoading(false);
  };

  const handleSearch = async (val) => {
    setQuery(val);
    setActiveGenre(null);
    if (!val.trim()) {
      return loadDefault();
    }
    setLoading(true);
    const data = await searchAnimeKitsu(val).catch(() => []);
    setResults(data || []);
    setLoading(false);
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (query) handleSearch(query);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const handleGenreClick = async (genre) => {
    setQuery('');
    if (activeGenre === genre) {
      setActiveGenre(null);
      return loadDefault();
    }
    setActiveGenre(genre);
    setLoading(true);
    const data = await discoverKitsuByCategory(genre).catch(() => []);
    setResults(data || []);
    setLoading(false);
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-primary">Browse <span className="text-accent-teal">Anime</span></h1>
        <div className="relative w-full md:w-96">
          <input type="text" placeholder="Search anime..." value={query} onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-surface p-3 pr-10 rounded-lg border border-border focus:ring-2 focus:ring-accent-teal focus:outline-none placeholder-muted shadow-sm" />
          <span className="absolute right-3 top-3 text-muted">🔍</span>
        </div>
      </div>

      {!query && (
        <div className="mb-8 overflow-x-auto scrollbar-hide py-2">
          <div className="flex gap-2">
            {genres.map(g => (
              <button key={g} onClick={() => handleGenreClick(g)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors border ${activeGenre === g ? 'bg-accent-teal text-white border-accent-teal' : 'bg-surface text-secondary border-border hover:bg-surface-raised'}`}>
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {results.map(anime => (
            <ContentCard key={anime.id} id={anime.id} title={anime.title.english || anime.title.romaji} posterUrl={anime.coverImage?.large} contentType="anime" rating={anime.averageScore ? anime.averageScore / 10 : null} className="w-full aspect-[2/3]" />
          ))}
          {results.length === 0 && <p className="col-span-full text-center text-muted p-10 font-medium">No results found.</p>}
        </div>
      )}
    </div>
  );
}
