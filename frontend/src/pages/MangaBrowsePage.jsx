import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { browseManga, getTags, coverUrl, getTitle, SORT_OPTIONS, STATUSES } from '../api/mangadex';
import LoadingSpinner from '../components/LoadingSpinner';

const selectClass = 'bg-surface border border-border rounded-lg px-3 py-2 text-sm font-semibold text-primary focus:outline-none focus:ring-2 focus:ring-accent-purple cursor-pointer';

function MangaCard({ manga }) {
  const title = getTitle(manga);
  const poster = coverUrl(manga);
  const status = manga.attributes?.status;
  const statusLabel = { ongoing: 'Ongoing', completed: 'Completed', cancelled: 'Cancelled', hiatus: 'Hiatus' }[status] || '';

  return (
    <Link
      to={`/manga/${manga.id}`}
      className="relative block w-full aspect-[2/3] group rounded-lg overflow-hidden border border-border bg-surface transition-transform hover:scale-[1.04]"
    >
      <img src={poster} alt={title} className="w-full h-full object-cover" loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-2">
        <h3 className="text-white font-bold text-sm truncate w-full shadow-sm">{title}</h3>
        <div className="flex items-center justify-between mt-1 text-xs font-semibold">
          <span className="bg-accent-purple text-white px-1.5 py-0.5 rounded shadow-sm">Manga</span>
          {statusLabel && <span className="text-white/70">{statusLabel}</span>}
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
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('followedCount');
  const [tags, setTags] = useState([]);
  const [results, setResults] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    getTags().then(setTags).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setOffset(0);

    const run = async () => {
      setLoading(true);
      const { data, hasMore: more } = await browseManga({ query: search.trim(), tag, status, sort, offset: 0 }).catch(() => ({ data: [], hasMore: false }));
      if (cancelled) return;
      setResults(data);
      setHasMore(more);
      setLoading(false);
    };

    if (search.trim()) {
      const timer = setTimeout(run, 400);
      return () => { cancelled = true; clearTimeout(timer); };
    }
    run();
    return () => { cancelled = true; };
  }, [search, tag, status, sort]);

  const loadMore = async () => {
    const nextOffset = offset + 24;
    setLoadingMore(true);
    const { data, hasMore: more } = await browseManga({ query: search.trim(), tag, status, sort, offset: nextOffset }).catch(() => ({ data: [], hasMore: false }));
    setResults(prev => [...prev, ...data]);
    setOffset(nextOffset);
    setHasMore(more);
    setLoadingMore(false);
  };

  const isFiltered = tag || status || sort !== 'followedCount';

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-primary">Browse <span className="text-accent-purple">Manga</span></h1>
        <div className="relative w-full md:w-96">
          <input
            type="text"
            placeholder="Search manga..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface p-3 pr-10 rounded-lg border border-border focus:ring-2 focus:ring-accent-purple focus:outline-none placeholder-muted shadow-sm"
          />
          {search ? (
            <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-muted hover:text-primary transition-colors text-sm">✕</button>
          ) : (
            <span className="absolute right-3 top-3 text-muted text-sm">🔍</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <select value={tag} onChange={e => setTag(e.target.value)} className={selectClass}>
          <option value="">All Genres</option>
          {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <select value={status} onChange={e => setStatus(e.target.value)} className={selectClass}>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        {!search.trim() && (
          <select value={sort} onChange={e => setSort(e.target.value)} className={selectClass}>
            {SORT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        )}

        {isFiltered && (
          <button
            onClick={() => { setTag(''); setStatus(''); setSort('followedCount'); }}
            className="px-3 py-2 rounded-lg text-sm font-semibold text-accent-purple border border-accent-purple hover:bg-accent-purple/10 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {results.map(manga => <MangaCard key={manga.id} manga={manga} />)}
            {results.length === 0 && (
              <p className="col-span-full text-center text-muted p-10 font-medium">
                {search.trim() ? 'No results found.' : 'No manga found.'}
              </p>
            )}
          </div>

          {hasMore && (
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
