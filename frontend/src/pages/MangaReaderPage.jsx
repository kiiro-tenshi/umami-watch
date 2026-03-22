import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getChapterPages, getMangaChapters, getMangaById, getTitle } from '../api/mangadex';
import { getComickImages, getComickChapters, searchComick } from '../api/comick';
import LoadingSpinner from '../components/LoadingSpinner';

export default function MangaReaderPage() {
  const { mangaId, chapterId } = useParams();
  const navigate = useNavigate();

  const isComick = chapterId.startsWith('ck_');
  // Chapter ID format for ComicK: ck_{slug}~{chapterHid}~{chap}
  const [ckSlug = '', ckHid = '', ckChap = ''] = isComick ? chapterId.slice(3).split('~') : [];

  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(() => localStorage.getItem('manga-read-mode') || 'vertical');
  const [currentPage, setCurrentPage] = useState(0);
  const [allChapters, setAllChapters] = useState([]);
  const [mangaTitle, setMangaTitle] = useState('');
  const [chapterNum, setChapterNum] = useState('');
  const [dataSaver, setDataSaver] = useState(() => localStorage.getItem('manga-data-saver') === 'true');
  const [showUI, setShowUI] = useState(true);
  const uiTimerRef = useRef(null);

  // Fetch chapter pages (MangaDex or ComicK)
  useEffect(() => {
    let dead = false;
    setLoading(true);
    setError(null);
    setCurrentPage(0);
    setPages([]);

    (async () => {
      try {
        if (isComick) {
          const imgs = await getComickImages(ckSlug, ckHid, ckChap);
          if (!dead) setPages(imgs);
        } else {
          const pageData = await getChapterPages(chapterId);
          const list = dataSaver ? pageData.dataSaver : pageData.data;
          const quality = dataSaver ? 'data-saver' : 'data';
          if (!dead) setPages(list.map(f => `${pageData.baseUrl}/${quality}/${pageData.hash}/${f}`));
        }
      } catch (e) {
        if (!dead) setError('Failed to load chapter pages.');
      }
      if (!dead) setLoading(false);
    })();

    return () => { dead = true; };
  }, [chapterId, isComick, ckSlug, ckHid, ckChap, dataSaver]);

  // Fetch manga title + chapter list for navigation
  useEffect(() => {
    let dead = false;
    getMangaById(mangaId).then(m => { if (!dead) setMangaTitle(getTitle(m)); }).catch(() => {});

    (async () => {
      if (isComick) {
        // ckSlug is already in the chapter ID. Get manga HID from localStorage.
        let ckMangaHid;
        try {
          const stored = JSON.parse(localStorage.getItem(`ck_manga_${mangaId}`) || 'null');
          ckMangaHid = stored?.hid;
        } catch (_) {}
        if (!ckMangaHid) {
          // Fallback: search ComicK by manga title
          const mangaData = await getMangaById(mangaId).catch(() => null);
          if (mangaData) {
            const results = await searchComick(getTitle(mangaData)).catch(() => []);
            if (results.length) {
              ckMangaHid = results[0].hid;
              const ckSlugFound = results[0].slug;
              localStorage.setItem(`ck_manga_${mangaId}`, JSON.stringify({ hid: ckMangaHid, slug: ckSlugFound }));
            }
          }
        }
        if (!ckMangaHid || dead) return;
        const { chapters: raw } = await getComickChapters(ckMangaHid).catch(() => ({ chapters: [] }));
        if (dead) return;
        const seen = new Map();
        raw.forEach(ch => { if (ch.chap && !seen.has(ch.chap)) seen.set(ch.chap, ch); });
        const mapped = [...seen.values()].map(ch => ({
          id: `ck_${ckSlug}~${ch.hid}~${ch.chap}`,
          attributes: { chapter: ch.chap, title: ch.title || null },
        }));
        setAllChapters(mapped);
        const cur = mapped.find(c => c.id === chapterId);
        if (cur) setChapterNum(cur.attributes?.chapter || '');
      } else {
        const { data } = await getMangaChapters(mangaId, 0, 500).catch(() => ({ data: [] }));
        if (dead) return;
        const seen = new Map();
        data.forEach(ch => {
          const num = ch.attributes?.chapter;
          if (num && !seen.has(num)) seen.set(num, ch);
        });
        const sorted = [...seen.values()];
        setAllChapters(sorted);
        const cur = sorted.find(c => c.id === chapterId);
        if (cur) setChapterNum(cur.attributes?.chapter || '');
      }
    })();

    return () => { dead = true; };
  }, [mangaId, chapterId, isComick]);

  const currentChapterIdx = allChapters.findIndex(c => c.id === chapterId);
  const prevChapter = currentChapterIdx > 0 ? allChapters[currentChapterIdx - 1] : null;
  const nextChapter = currentChapterIdx < allChapters.length - 1 ? allChapters[currentChapterIdx + 1] : null;
  const externalUrl = allChapters[currentChapterIdx]?.attributes?.externalUrl;

  const resetUiTimer = useCallback(() => {
    setShowUI(true);
    clearTimeout(uiTimerRef.current);
    if (mode === 'page') {
      uiTimerRef.current = setTimeout(() => setShowUI(false), 3000);
    }
  }, [mode]);

  useEffect(() => {
    if (mode === 'vertical') {
      setShowUI(true);
      clearTimeout(uiTimerRef.current);
    } else {
      resetUiTimer();
    }
    return () => clearTimeout(uiTimerRef.current);
  }, [mode, resetUiTimer]);

  useEffect(() => {
    if (mode !== 'page') return;
    const onKey = (e) => {
      resetUiTimer();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setCurrentPage(p => Math.min(p + 1, pages.length - 1));
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setCurrentPage(p => Math.max(p - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, pages.length, resetUiTimer]);

  const toggleMode = () => {
    const next = mode === 'vertical' ? 'page' : 'vertical';
    setMode(next);
    localStorage.setItem('manga-read-mode', next);
  };

  const toggleDataSaver = () => {
    const next = !dataSaver;
    setDataSaver(next);
    localStorage.setItem('manga-data-saver', String(next));
  };

  const goToChapter = (ch) => { if (ch) navigate(`/manga/${mangaId}/chapter/${ch.id}`); };

  return (
    <div className="min-h-screen bg-black text-white" onMouseMove={resetUiTimer} onClick={resetUiTimer}>
      {/* Top bar */}
      <div className={`fixed top-0 left-0 right-0 z-50 bg-black/90 border-b border-white/10 transition-opacity duration-300 ${showUI || mode === 'vertical' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-3">
          <Link to={`/manga/${mangaId}`} className="text-white/60 hover:text-white transition-colors text-sm font-semibold flex items-center gap-1 shrink-0">
            ← Back
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-xs sm:text-sm truncate">{mangaTitle}</p>
            <p className="text-white/50 text-xs hidden sm:block">{chapterNum ? `Chapter ${chapterNum}` : ''}</p>
          </div>
          {allChapters.length > 0 && (
            <select
              value={chapterId}
              onChange={e => navigate(`/manga/${mangaId}/chapter/${e.target.value}`)}
              className="bg-white/10 border border-white/20 rounded px-2 py-1.5 text-xs text-white focus:outline-none max-w-[110px] sm:max-w-none"
            >
              {allChapters.map(ch => (
                <option key={ch.id} value={ch.id}>Ch. {ch.attributes?.chapter || '?'}</option>
              ))}
            </select>
          )}
          <button
            onClick={toggleMode}
            className="bg-white/10 hover:bg-white/20 border border-white/20 rounded p-1.5 sm:px-2.5 sm:py-1 text-xs font-semibold transition-colors shrink-0"
            title="Toggle reading mode"
          >
            <span className="hidden sm:inline">{mode === 'vertical' ? '📄 Page' : '📜 Scroll'}</span>
            <span className="sm:hidden">{mode === 'vertical' ? '📄' : '📜'}</span>
          </button>
          {!isComick && (
            <button
              onClick={toggleDataSaver}
              className={`border rounded p-1.5 sm:px-2.5 sm:py-1 text-xs font-semibold transition-colors shrink-0 ${dataSaver ? 'bg-accent-purple border-accent-purple text-white' : 'bg-white/10 border-white/20 hover:bg-white/20'}`}
              title="Toggle data saver (lower quality)"
            >
              <span className="hidden sm:inline">{dataSaver ? 'HQ Off' : 'HQ On'}</span>
              <span className="sm:hidden">{dataSaver ? '🔋' : '✨'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-screen"><LoadingSpinner /></div>
      ) : error || pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-screen gap-4 text-center px-6">
          <p className="text-red-400 font-semibold">{error || 'This chapter is not hosted here.'}</p>
          {externalUrl && (
            <a href={externalUrl} target="_blank" rel="noopener noreferrer"
              className="bg-accent-purple hover:opacity-90 text-white font-bold px-6 py-2.5 rounded-lg text-sm">
              Read on official site →
            </a>
          )}
          {error && <button onClick={() => window.location.reload()} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded text-sm">Retry</button>}
          <Link to={`/manga/${mangaId}`} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded text-sm">← Back to chapters</Link>
        </div>
      ) : mode === 'vertical' ? (
        <div className="pt-16 pb-24 flex flex-col items-center">
          {pages.map((url, i) => (
            <img key={i} src={url} alt={`Page ${i + 1}`} className="w-full max-w-2xl" loading={i < 3 ? 'eager' : 'lazy'} />
          ))}
          <div className="mt-8 flex gap-4">
            {prevChapter && (
              <button onClick={() => goToChapter(prevChapter)} className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-5 py-2.5 font-semibold text-sm">
                ← Ch. {prevChapter.attributes?.chapter}
              </button>
            )}
            <Link to={`/manga/${mangaId}`} className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-5 py-2.5 font-semibold text-sm">
              Chapter List
            </Link>
            {nextChapter && (
              <button onClick={() => goToChapter(nextChapter)} className="bg-accent-purple hover:opacity-90 rounded-lg px-5 py-2.5 font-semibold text-sm">
                Ch. {nextChapter.attributes?.chapter} →
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-screen pt-10 select-none">
          {pages[currentPage] && (
            <img src={pages[currentPage]} alt={`Page ${currentPage + 1}`} className="max-h-[calc(100vh-80px)] max-w-full object-contain" draggable={false} />
          )}
          <button onClick={() => { resetUiTimer(); setCurrentPage(p => Math.max(p - 1, 0)); }} className="absolute left-0 top-0 w-1/3 h-full opacity-0" aria-label="Previous page" />
          <button onClick={() => { resetUiTimer(); setCurrentPage(p => Math.min(p + 1, pages.length - 1)); }} className="absolute right-0 top-0 w-1/3 h-full opacity-0" aria-label="Next page" />
        </div>
      )}

      {mode === 'page' && (
        <div className={`fixed bottom-0 left-0 right-0 z-50 bg-black/90 border-t border-white/10 px-4 py-3 flex items-center gap-3 transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <button onClick={() => goToChapter(prevChapter)} disabled={!prevChapter} className="text-white/50 hover:text-white disabled:opacity-20 transition-colors text-sm font-semibold">← Prev Ch.</button>
          <div className="flex-1 flex flex-col items-center gap-1">
            <input type="range" min={0} max={pages.length - 1} value={currentPage} onChange={e => setCurrentPage(Number(e.target.value))} className="w-full accent-accent-purple cursor-pointer" />
            <span className="text-xs text-white/50">{currentPage + 1} / {pages.length}</span>
          </div>
          <button onClick={() => goToChapter(nextChapter)} disabled={!nextChapter} className="text-white/50 hover:text-white disabled:opacity-20 transition-colors text-sm font-semibold">Next Ch. →</button>
        </div>
      )}
    </div>
  );
}
