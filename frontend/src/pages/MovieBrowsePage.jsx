import { useState, useEffect } from 'react';
import { searchContent, getTrending, getGenres, discoverContent, tmdbImage } from '../api/tmdb';
import ContentCard from '../components/ContentCard';
import LoadingSpinner from '../components/LoadingSpinner';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1989 }, (_, i) => CURRENT_YEAR - i);

const SORT_OPTIONS = {
  movie: [
    { value: 'TRENDING', label: 'Trending' },
    { value: 'popularity.desc', label: 'Most Popular' },
    { value: 'vote_average.desc', label: 'Top Rated' },
    { value: 'release_date.desc', label: 'Newest' },
    { value: 'revenue.desc', label: 'Highest Grossing' },
  ],
  tv: [
    { value: 'TRENDING', label: 'Trending' },
    { value: 'popularity.desc', label: 'Most Popular' },
    { value: 'vote_average.desc', label: 'Top Rated' },
    { value: 'first_air_date.desc', label: 'Newest' },
  ],
};

const selectClass = 'bg-surface border border-border rounded-lg px-3 py-2 text-sm font-semibold text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue cursor-pointer';

export default function MovieBrowsePage({ type }) {
  const isMovie = type === 'movie';
  const typeLabel = isMovie ? 'Movies' : 'TV Shows';
  const accentColor = isMovie ? 'accent-blue' : 'accent-purple';

  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('');
  const [year, setYear] = useState('');
  const [sort, setSort] = useState('TRENDING');
  const [genres, setGenres] = useState([]);
  const [results, setResults] = useState([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setSearch('');
    setGenre('');
    setYear('');
    setSort('TRENDING');
    setPage(1);
    getGenres(type).then(data => setGenres(data.genres || [])).catch(() => {});
  }, [type]);

  useEffect(() => {
    let cancelled = false;
    const isSearch = search.trim().length > 0;

    const run = async () => {
      setLoading(true);
      setPage(1);
      const data = isSearch
        ? await searchContent(search.trim(), type).catch(() => ({ results: [], total_pages: 1, page: 1 }))
        : await fetchDiscover(1, { sort, genre, year });
      if (cancelled) return;
      setResults(data.results || []);
      setHasNextPage((data.page || 1) < (data.total_pages || 1));
      setLoading(false);
    };

    if (isSearch) {
      const timer = setTimeout(run, 400);
      return () => { cancelled = true; clearTimeout(timer); };
    }
    run();
    return () => { cancelled = true; };
  }, [search, genre, year, sort, type]);

  async function fetchDiscover(pageNum, { sort: s, genre: g, year: y } = {}) {
    const useTrending = s === 'TRENDING' && !g && !y;
    if (useTrending) return getTrending(type, 'week', pageNum);
    const sortBy = s === 'TRENDING' ? 'popularity.desc' : s;
    const params = { sort_by: sortBy, page: pageNum };
    if (g) params.with_genres = g;
    if (y) params[isMovie ? 'primary_release_year' : 'first_air_date_year'] = y;
    if (s === 'vote_average.desc') params['vote_count.gte'] = 100;
    return discoverContent(type, params);
  }

  const loadMore = async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    const data = await fetchDiscover(nextPage, { sort, genre, year }).catch(() => ({ results: [], total_pages: 1, page: nextPage }));
    setResults(prev => [...prev, ...(data.results || [])]);
    setHasNextPage(nextPage < (data.total_pages || 1));
    setPage(nextPage);
    setLoadingMore(false);
  };

  const isFiltered = !search.trim() && (sort !== 'TRENDING' || genre || year);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Title + Search */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-primary">
          Browse <span className={`text-${accentColor}`}>{typeLabel}</span>
        </h1>
        <div className="relative w-full md:w-96">
          <input
            type="text"
            placeholder={`Search ${typeLabel.toLowerCase()}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`w-full bg-surface p-3 pr-10 rounded-lg border border-border focus:ring-2 focus:ring-${accentColor} focus:outline-none placeholder-muted shadow-sm`}
          />
          {search ? (
            <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-muted hover:text-primary transition-colors text-sm">✕</button>
          ) : (
            <span className="absolute right-3 top-3 text-muted text-sm">🔍</span>
          )}
        </div>
      </div>

      {/* Filter bar */}
      {!search.trim() && (
        <div className="flex flex-wrap gap-2 mb-6 items-center">
          <select value={year} onChange={e => setYear(e.target.value)} className={selectClass}>
            <option value="">All Years</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <select value={genre} onChange={e => setGenre(e.target.value)} className={selectClass}>
            <option value="">All Genres</option>
            {genres.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>

          <select value={sort} onChange={e => setSort(e.target.value)} className={selectClass}>
            {SORT_OPTIONS[type].map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          {isFiltered && (
            <button
              onClick={() => { setSort('TRENDING'); setGenre(''); setYear(''); }}
              className="px-3 py-2 rounded-lg text-sm font-semibold text-accent-blue border border-accent-blue hover:bg-accent-blue/10 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* Active filter label */}
      {!search.trim() && (
        <p className="text-xs font-semibold text-muted mb-4 uppercase tracking-wide">
          {[
            genres.find(g => String(g.id) === String(genre))?.name || null,
            year || null,
            SORT_OPTIONS[type].find(s => s.value === sort)?.label,
          ].filter(Boolean).join(' · ')}
        </p>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {results.map(item => (
              <ContentCard
                key={item.id}
                id={item.id}
                title={isMovie ? item.title : item.name}
                posterUrl={tmdbImage(item.poster_path)}
                contentType={type}
                rating={item.vote_average}
              />
            ))}
            {results.length === 0 && (
              <p className="col-span-full text-center text-muted p-10 font-medium">No results found.</p>
            )}
          </div>

          {hasNextPage && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-8 py-3 rounded-lg bg-surface border border-border text-primary font-semibold hover:bg-surface-raised transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
