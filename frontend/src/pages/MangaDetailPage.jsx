import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getMangaById, getMangaChapters, coverUrl, getTitle, getDescription, getAuthor } from '../api/mangadex';
import { searchComick, getComickChapters } from '../api/comick';
import { useAuth } from '../hooks/useAuth';
import { useReadlist } from '../hooks/useReadlist';
import { useReadChapters } from '../hooks/useReadChapters';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import LoadingSpinner from '../components/LoadingSpinner';
import EpisodeContextMenu from '../components/EpisodeContextMenu';

const dedupByChap = (chapters) => {
  const seen = new Map();
  chapters.forEach(ch => {
    const num = ch.attributes?.chapter;
    if (num && !seen.has(num)) seen.set(num, ch);
  });
  return [...seen.values()];
};

export default function MangaDetailPage() {
  const { mangaId } = useParams();
  const { user } = useAuth();
  const { isInReadlist, toggleReadlist } = useReadlist(user?.uid);

  const [manga, setManga] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [mangaProgress, setMangaProgress] = useState(null);
  const [chMenu, setChMenu] = useState(null);

  const { isChapterRead, toggleRead, markAllRead, markAllUnread } = useReadChapters(mangaId, user);

  useEffect(() => {
    let dead = false;
    setManga(null);
    setChapters([]);
    setLoading(true);

    (async () => {
      const mangaData = await getMangaById(mangaId).catch(() => null);
      if (dead) return;
      setManga(mangaData);
      setLoading(false);
      if (!mangaData) return;

      setChaptersLoading(true);
      const mdRaw = await getMangaChapters(mangaId).catch(() => []);
      if (dead) return;
      const mdDeduped = dedupByChap(mdRaw);
      if (mdDeduped.length >= 3) {
        setChapters(mdDeduped);
        setChaptersLoading(false);
      } else {
        // MangaDex has too few chapters (likely licensed takedown) — try ComicK direct from browser
        const ckManga = await searchComick(getTitle(mangaData)).catch(() => null);
        if (dead) return;
        if (ckManga?.slug) {
          const ckChapters = await getComickChapters(ckManga.slug).catch(() => []);
          if (dead) return;
          setChapters(dedupByChap(ckChapters.length ? ckChapters : mdDeduped));
        } else {
          setChapters(mdDeduped);
        }
        setChaptersLoading(false);
      }
    })();

    return () => { dead = true; };
  }, [mangaId]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid, 'history', `manga_${mangaId}`))
      .then(snap => { if (snap.exists()) setMangaProgress(snap.data()); })
      .catch(() => {});
  }, [mangaId, user]);

  if (loading) return <LoadingSpinner fullScreen />;
  if (!manga) return <div className="p-8 text-center text-red-500 font-bold">Failed to load manga.</div>;

  const title = getTitle(manga);
  const description = getDescription(manga);
  const author = getAuthor(manga);
  const poster = coverUrl(manga);
  const status = manga.attributes?.status;
  const statusLabel = { ongoing: 'Ongoing', completed: 'Completed', cancelled: 'Cancelled', hiatus: 'Hiatus' }[status] || '';
  const year = manga.attributes?.year;
  const genres = manga.attributes?.tags?.filter(t => t.attributes?.group === 'genre') || [];
  const inReadlist = isInReadlist(mangaId);
  const availableLangs = manga.attributes?.availableTranslatedLanguages || [];
  const hasEnglish = availableLangs.includes('en');
  const noEnglishButOtherLangs = !chaptersLoading && chapters.length === 0 && availableLangs.length > 0;

  return (
    <div className="pb-12">
      {/* Banner */}
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
              {statusLabel && <span className="bg-accent-purple text-white px-2.5 py-1 rounded text-sm font-bold shadow-sm">{statusLabel}</span>}
              {year && <span className="bg-surface-raised border border-border text-secondary px-2.5 py-1 rounded text-sm font-semibold">{year}</span>}
              <span className="bg-surface-raised border border-border text-secondary px-2.5 py-1 rounded text-sm font-semibold">
                {chapters.length} Chapters
              </span>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              {genres.map(g => (
                <span key={g.id} className="text-xs text-muted border border-border px-2 py-0.5 rounded-full">
                  {g.attributes.name.en}
                </span>
              ))}
            </div>

            {description && (
              <p className="text-secondary leading-relaxed mb-6 max-w-3xl font-medium line-clamp-4">{description}</p>
            )}

            <div className="flex gap-3 flex-wrap">
              {chapters.length > 0 && (
                mangaProgress?.chapterId ? (
                  <Link
                    to={`/manga/${mangaId}/chapter/${mangaProgress.chapterId}?page=${mangaProgress.pageNum || 1}`}
                    className="bg-accent-purple hover:opacity-90 text-white font-bold py-2.5 px-6 rounded-lg shadow-md flex items-center gap-2 transition-transform hover:scale-105"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    Continue Ch. {mangaProgress.chapterNum}
                    {mangaProgress.pageNum ? <span className="opacity-75 font-normal text-sm">· p.{mangaProgress.pageNum}</span> : null}
                  </Link>
                ) : (
                  <Link
                    to={`/manga/${mangaId}/chapter/${chapters[0].id}`}
                    className="bg-accent-purple hover:opacity-90 text-white font-bold py-2.5 px-6 rounded-lg shadow-md flex items-center gap-2 transition-transform hover:scale-105"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    Start Reading
                  </Link>
                )
              )}
              <button
                onClick={() => toggleReadlist({ contentId: mangaId, contentType: 'manga', title, posterUrl: poster })}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold shadow-md transition-transform hover:scale-105 border ${inReadlist ? 'bg-surface border-border text-red-600' : 'bg-surface-raised border-border text-primary'}`}
              >
                <span className="text-xl">{inReadlist ? '♥️' : '♡'}</span>
                {inReadlist ? 'In Readlist' : 'Add to Readlist'}
              </button>
            </div>
          </div>
        </div>

        {/* Chapter list */}
        <div className="mt-8 bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-primary">Chapters</h2>
            {user && chapters.length > 0 && (
              <button
                onClick={() => {
                  const lastReadNum = mangaProgress?.chapterNum ? parseFloat(mangaProgress.chapterNum) : null;
                  const allRead = chapters.every(ch => isChapterRead(ch.attributes?.chapter, lastReadNum));
                  allRead ? markAllUnread() : markAllRead(chapters);
                }}
                className="text-xs px-3 py-2 rounded-md border border-border hover:bg-surface-raised transition-colors text-secondary font-medium"
              >
                {chapters.every(ch => isChapterRead(ch.attributes?.chapter, mangaProgress?.chapterNum ? parseFloat(mangaProgress.chapterNum) : null)) ? 'Unread all' : 'Read all'}
              </button>
            )}
          </div>

          {chaptersLoading && chapters.length === 0 ? (
            <div className="p-8 flex justify-center"><LoadingSpinner /></div>
          ) : (
            <div className="divide-y divide-border">
              {chapters.length === 0 && !chaptersLoading && (
                <div className="p-8 text-center space-y-3">
                  <p className="text-muted font-medium">No English chapters available on MangaDex.</p>
                  {noEnglishButOtherLangs && (
                    <p className="text-xs text-muted">
                      Available in: {availableLangs.filter(l => l !== 'en').slice(0, 6).join(', ')}
                      {availableLangs.length > 7 ? ` +${availableLangs.length - 7} more` : ''}
                    </p>
                  )}
                  {hasEnglish && (
                    <p className="text-xs text-muted">English chapters exist but may have been removed due to licensing.</p>
                  )}
                  <a
                    href={`https://mangadex.org/title/${mangaId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-accent-purple hover:underline font-medium"
                  >
                    View on MangaDex
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )}
              {(() => {
                const lastReadNum = mangaProgress?.chapterNum ? parseFloat(mangaProgress.chapterNum) : null;
                const currentChId = mangaProgress?.chapterId;
                return chapters.map(ch => {
                  const chNum = ch.attributes?.chapter;
                  const isRead = isChapterRead(chNum, lastReadNum);
                  const isCurrent = currentChId === ch.id;
                  const group = ch.relationships?.find(r => r.type === 'scanlation_group')?.attributes?.name;
                  const rowClass = `flex items-center justify-between px-6 py-3 hover:bg-surface-raised transition-colors ${isCurrent ? 'bg-accent-purple/10 border-l-4 border-l-accent-purple' : isRead ? 'opacity-50' : ''}`;
                  const handleContextMenu = (e) => {
                    e.preventDefault();
                    setChMenu({ x: e.clientX, y: e.clientY, chapterNum: chNum, isRead });
                  };
                  return (
                    <Link key={ch.id} to={`/manga/${mangaId}/chapter/${ch.id}`} onContextMenu={handleContextMenu} className={rowClass}>
                      <div className="flex items-center gap-2 min-w-0">
                        {isRead && (
                          <svg className="w-3.5 h-3.5 text-accent-purple shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        <span className={`font-semibold text-sm shrink-0 ${isCurrent ? 'text-accent-purple' : 'text-primary'}`}>
                          Chapter {chNum || '?'}
                        </span>
                        {isCurrent && <span className="text-xs bg-accent-purple text-white px-1.5 py-0.5 rounded shrink-0">Reading</span>}
                        {isCurrent && mangaProgress?.pageNum && (
                          <span className="text-xs text-accent-purple/70 shrink-0">p.{mangaProgress.pageNum}</span>
                        )}
                        {ch.attributes?.title && <span className="text-muted text-sm truncate">— {ch.attributes.title}</span>}
                      </div>
                      {group && <span className="text-xs text-muted hidden sm:block shrink-0 ml-4">{group}</span>}
                    </Link>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      {chMenu && (
        <EpisodeContextMenu
          x={chMenu.x}
          y={chMenu.y}
          epNum={chMenu.chapterNum}
          isWatched={chMenu.isRead}
          onToggle={(chNum) => toggleRead(chNum, chMenu.isRead)}
          onClose={() => setChMenu(null)}
          watchedLabel="Mark as read"
          unwatchedLabel="Mark as unread"
        />
      )}
    </div>
  );
}
