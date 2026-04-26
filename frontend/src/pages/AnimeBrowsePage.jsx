import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { browseAnime, getAnimeGenres, getCurrentSeasonInfo } from '../api/anilist';
import { searchAnimeKitsu } from '../api/kitsu';
import ContentCard from '../components/ContentCard';
import LoadingSpinner from '../components/LoadingSpinner';

const SEASONS = [
  { value: '', label: 'All Seasons' },
  { value: 'WINTER', label: 'Winter' },
  { value: 'SPRING', label: 'Spring' },
  { value: 'SUMMER', label: 'Summer' },
  { value: 'FALL', label: 'Fall' },
];

const SORTS = [
  { value: 'TRENDING_DESC', label: 'Trending' },
  { value: 'POPULARITY_DESC', label: 'Popular' },
  { value: 'SCORE_DESC', label: 'Top Rated' },
  { value: 'START_DATE_DESC', label: 'Newest' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1999 }, (_, i) => CURRENT_YEAR - i);

const selectClass = 'bg-surface border border-border rounded-lg px-3 py-2 text-sm font-semibold text-primary focus:outline-none focus:ring-2 focus:ring-accent-teal cursor-pointer';

export default function AnimeBrowsePage() {
  const { season: defaultSeason, year: defaultYear } = getCurrentSeasonInfo();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [season, setSeason] = useState(defaultSeason);
  const [year, setYear] = useState(String(defaultYear));
  const [genre, setGenre] = useState('');
  const [sort, setSort] = useState('TRENDING_DESC');
  const [genres, setGenres] = useState([]);
  const [results, setResults] = useState([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    getAnimeGenres().then(setGenres).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isSearch = search.trim().length > 0;

    const run = async () => {
      setLoading(true);
      setPage(1);
      if (isSearch) {
        // Use Kitsu search so results have real Kitsu IDs — no source=anilist needed
        const media = await searchAnimeKitsu(search.trim()).catch(() => []);
        if (cancelled) return;
        setResults(media);
        setHasNextPage(false);
      } else {
        const params = buildParams(1);
        const { media, hasNextPage: hnp } = await browseAnime(params).catch(() => ({ media: [], hasNextPage: false }));
        if (cancelled) return;
        setResults(media);
        setHasNextPage(hnp);
      }
      setLoading(false);
    };

    const delay = isSearch ? 400 : 300;
    const timer = setTimeout(run, delay);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, season, year, genre, sort]);

  function buildParams(pageNum) {
    const params = { sort, page: pageNum, perPage: 24 };
    if (season) params.season = season;
    if (year) params.year = year;
    if (genre) params.genre = genre;
    return params;
  }

  const loadMore = async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    const { media, hasNextPage: hnp } = await browseAnime(buildParams(nextPage))
      .catch(() => ({ media: [], hasNextPage: false }));
    setResults(prev => [...prev, ...media]);
    setHasNextPage(hnp);
    setPage(nextPage);
    setLoadingMore(false);
  };

  const isFiltered = !search.trim() && (season !== defaultSeason || year !== String(defaultYear) || genre || sort !== 'TRENDING_DESC');

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Title + Search */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-primary">Browse <span className="text-accent-teal">Anime</span></h1>
        <div className="relative w-full md:w-96">
          <input
            type="text"
            placeholder="Search anime..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface p-3 pr-10 rounded-lg border border-border focus:ring-2 focus:ring-accent-teal focus:outline-none placeholder-muted shadow-sm"
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
        <div className="flex flex-wrap gap-2 mb-5 items-center">
          <select value={season} onChange={e => setSeason(e.target.value)} className={selectClass}>
            {SEASONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <select value={year} onChange={e => setYear(e.target.value)} className={selectClass}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <select value={genre} onChange={e => setGenre(e.target.value)} className={selectClass}>
            <option value="">All Genres</option>
            {genres.map(g => <option key={g} value={g}>{g}</option>)}
          </select>

          <select value={sort} onChange={e => setSort(e.target.value)} className={selectClass}>
            {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          {isFiltered && (
            <button
              onClick={() => { setSeason(defaultSeason); setYear(String(defaultYear)); setGenre(''); setSort('TRENDING_DESC'); }}
              className="px-3 py-2 rounded-lg text-sm font-semibold text-accent-teal border border-accent-teal hover:bg-accent-teal/10 transition-colors"
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
            genre || null,
            season ? SEASONS.find(s => s.value === season)?.label : 'All Seasons',
            year,
            SORTS.find(s => s.value === sort)?.label,
          ].filter(Boolean).join(' · ')}
        </p>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {results.map(anime => (
              <ContentCard
                key={anime.id}
                id={anime.id}
                title={anime.title.english || anime.title.romaji}
                posterUrl={anime.coverImage?.large}
                contentType="anime"
                rating={anime.averageScore ? anime.averageScore / 10 : null}
                source={search.trim() ? undefined : 'anilist'}
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
