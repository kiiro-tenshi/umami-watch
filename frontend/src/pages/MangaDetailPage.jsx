import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getMangaById, getMangaChapters, coverUrl, getCoverFilename, getTitle, getDescription, getAuthor } from '../api/mangadex';
import { useAuth } from '../hooks/useAuth';
import { useWatchlist } from '../hooks/useWatchlist';
import LoadingSpinner from '../components/LoadingSpinner';

export default function MangaDetailPage() {
  const { mangaId } = useParams();
  const { user } = useAuth();
  const { isInWatchlist, toggleWatchlist } = useWatchlist(user?.uid);

  const [manga, setManga] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMoreRaw, setHasMoreRaw] = useState(false);
  const PAGE_SIZE = 100;

  useEffect(() => {
    const fetchManga = async () => {
      setLoading(true);
      try {
        const data = await getMangaById(mangaId);
        setManga(data);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    fetchManga();
  }, [mangaId]);

  useEffect(() => {
    const fetchChapters = async () => {
      setChaptersLoading(true);
      try {
        const { data } = await getMangaChapters(mangaId, offset, PAGE_SIZE);
        setHasMoreRaw(data.length === PAGE_SIZE);
        // Deduplicate by chapter number, prefer earlier (more established) groups
        setChapters(prev => {
          const merged = offset === 0 ? data : [...prev, ...data];
          const seen = new Map();
          merged.forEach(ch => {
            const num = ch.attributes?.chapter;
            if (num && !seen.has(num)) seen.set(num, ch);
          });
          return [...seen.values()];
        });
      } catch (e) {
        console.error(e);
      }
      setChaptersLoading(false);
    };
    fetchChapters();
  }, [mangaId, offset]);

  if (loading) return <LoadingSpinner fullScreen />;
  if (!manga) return <div className="p-8 text-center text-red-500 font-bold">Failed to load manga.</div>;

  const filename = getCoverFilename(manga);
  const title = getTitle(manga);
  const description = getDescription(manga);
  const author = getAuthor(manga);
  const poster = filename ? coverUrl(manga.id, filename, 512) : '/placeholder.png';
  const attr = manga.attributes || {};
  const status = attr.status;
  const year = attr.year;
  const tags = attr.tags?.filter(t => t.attributes?.group === 'genre') || [];
  const inWatchlist = isInWatchlist(mangaId);
  const hasMore = hasMoreRaw;

  return (
    <div className="pb-12">
      {/* Banner (blurred cover) */}
      <div className="relative w-full h-[140px] sm:h-[200px] md:h-[300px] overflow-hidden bg-primary">
        <img src={poster} alt="Banner" className="w-full h-full object-cover opacity-40 blur-sm scale-110" />
        <div className="absolute inset-0 bg-gradient-to-t from-page via-page/60 to-transparent" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 -mt-14 sm:-mt-20 md:-mt-28 relative z-10">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8 bg-surface p-4 sm:p-6 rounded-2xl shadow-xl border border-border">
          <div className="w-28 sm:w-36 md:w-52 shrink-0 mx-auto md:mx-0">
            <img src={poster} alt="Cover" className="w-full rounded-xl shadow-lg border border-border-subtle" />
          </div>

          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl md:text-4xl font-bold text-primary mb-2">{title}</h1>
            {author && <p className="text-secondary font-semibold text-sm mb-4">{author}</p>}

            <div className="flex flex-wrap items-center gap-2 mb-4">
              {status && <span className="bg-accent-purple text-white px-2.5 py-1 rounded text-sm font-bold shadow-sm capitalize">{status}</span>}
              {year && <span className="bg-surface-raised border border-border text-secondary px-2.5 py-1 rounded text-sm font-semibold">{year}</span>}
              <span className="bg-surface-raised border border-border text-secondary px-2.5 py-1 rounded text-sm font-semibold">
                {chapters.length}{hasMore ? '+' : ''} Chapters
              </span>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              {tags.map(tag => (
                <span key={tag.id} className="text-xs text-muted border border-border px-2 py-0.5 rounded-full">
                  {tag.attributes?.name?.en || ''}
                </span>
              ))}
            </div>

            {description && (
              <p className="text-secondary leading-relaxed mb-6 max-w-3xl font-medium line-clamp-4">{description}</p>
            )}

            <div className="flex gap-3">
              {chapters.length > 0 && (
                <Link
                  to={`/manga/${mangaId}/chapter/${chapters[0].id}`}
                  className="bg-accent-purple hover:opacity-90 text-white font-bold py-2.5 px-6 rounded-lg shadow-md flex items-center gap-2 transition-transform hover:scale-105"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  Start Reading
                </Link>
              )}
              <button
                onClick={() => toggleWatchlist({ contentId: mangaId, contentType: 'manga', title, posterUrl: poster })}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold shadow-md transition-transform hover:scale-105 border ${inWatchlist ? 'bg-surface border-border text-red-600' : 'bg-surface-raised border-border text-primary'}`}
              >
                <span className="text-xl">{inWatchlist ? '♥️' : '♡'}</span>
                {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
              </button>
            </div>
          </div>
        </div>

        {/* Chapter list */}
        <div className="mt-8 bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-xl font-bold text-primary">Chapters</h2>
          </div>

          {chaptersLoading && chapters.length === 0 ? (
            <div className="p-8 flex justify-center"><LoadingSpinner /></div>
          ) : (
            <>
              <div className="divide-y divide-border">
                {chapters.map(ch => {
                  const num = ch.attributes?.chapter;
                  const chTitle = ch.attributes?.title;
                  const group = ch.relationships?.find(r => r.type === 'scanlation_group');
                  const groupName = group?.attributes?.name;
                  return (
                    <Link
                      key={ch.id}
                      to={`/manga/${mangaId}/chapter/${ch.id}`}
                      className="flex items-center justify-between px-6 py-3 hover:bg-surface-raised transition-colors"
                    >
                      <div>
                        <span className="font-semibold text-primary text-sm">Chapter {num || '?'}</span>
                        {chTitle && <span className="text-muted text-sm ml-2">— {chTitle}</span>}
                      </div>
                      {groupName && <span className="text-xs text-muted hidden sm:block">{groupName}</span>}
                    </Link>
                  );
                })}
              </div>

              {hasMore && (
                <div className="p-4 flex justify-center">
                  <button
                    onClick={() => setOffset(o => o + PAGE_SIZE)}
                    disabled={chaptersLoading}
                    className="bg-surface-raised border border-border text-primary font-semibold px-6 py-2 rounded-lg hover:bg-surface transition-colors disabled:opacity-50"
                  >
                    {chaptersLoading ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
