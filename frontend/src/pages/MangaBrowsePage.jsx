import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { searchManga, getTrendingManga, getMangaByGenre, getMangaTags, coverUrl, getCoverFilename, getTitle } from '../api/mangadex';
import LoadingSpinner from '../components/LoadingSpinner';

function MangaCard({ manga }) {
  const filename = getCoverFilename(manga);
  const title = getTitle(manga);
  const poster = filename ? coverUrl(manga.id, filename, 256) : '/placeholder.png';
  const status = manga.attributes?.status;

  return (
    <Link
      to={`/manga/${manga.id}`}
      className="relative block w-full aspect-[2/3] group rounded-lg overflow-hidden border border-border bg-surface transition-transform hover:scale-[1.04]"
    >
      <img src={poster} alt={title} className="w-full h-full object-cover" loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-2">
        <h3 className="text-white font-bold text-sm truncate w-full shadow-sm">{title}</h3>
        <div className="flex items-center justify-between mt-1 text-xs font-semibold">
          <span className="bg-accent-purple text-white px-1.5 py-0.5 rounded shadow-sm capitalize">Manga</span>
          {status && <span className="text-white/70 capitalize">{status}</span>}
        </div>
      </div>
      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-12 h-12 bg-accent-blue rounded-full flex items-center justify-center text-white shadow-lg">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

export default function MangaBrowsePage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [tags, setTags] = useState([]);
  const [activeTag, setActiveTag] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMangaTags().then(setTags).catch(console.error);
    loadDefault();
  }, []);

  const loadDefault = async () => {
    setLoading(true);
    const data = await getTrendingManga().catch(() => []);
    setResults(data);
    setLoading(false);
  };

  // Debounced search
  useEffect(() => {
    if (!query.trim()) return;
    const timer = setTimeout(async () => {
      setActiveTag(null);
      setLoading(true);
      const data = await searchManga(query).catch(() => []);
      setResults(data);
      setLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const handleTagClick = async (tag) => {
    setQuery('');
    if (activeTag?.id === tag.id) {
      setActiveTag(null);
      return loadDefault();
    }
    setActiveTag(tag);
    setLoading(true);
    const data = await getMangaByGenre(tag.id).catch(() => []);
    setResults(data);
    setLoading(false);
  };

  const handleQueryChange = (val) => {
    setQuery(val);
    setActiveTag(null);
    if (!val.trim()) loadDefault();
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-primary">Browse <span className="text-accent-purple">Manga</span></h1>
        <div className="relative w-full md:w-96">
          <input
            type="text"
            placeholder="Search manga..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="w-full bg-surface p-3 pr-10 rounded-lg border border-border focus:ring-2 focus:ring-accent-purple focus:outline-none placeholder-muted shadow-sm"
          />
          <span className="absolute right-3 top-3 text-muted">🔍</span>
        </div>
      </div>

      {!query && (
        <div className="mb-8 overflow-x-auto scrollbar-hide py-2">
          <div className="flex gap-2">
            {tags.map(tag => {
              const name = tag.attributes?.name?.en || 'Unknown';
              return (
                <button key={tag.id} onClick={() => handleTagClick(tag)}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors border ${activeTag?.id === tag.id ? 'bg-accent-purple text-white border-accent-purple' : 'bg-surface text-secondary border-border hover:bg-surface-raised'}`}>
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {results.map(manga => <MangaCard key={manga.id} manga={manga} />)}
          {results.length === 0 && <p className="col-span-full text-center text-muted p-10 font-medium">No results found.</p>}
        </div>
      )}
    </div>
  );
}
