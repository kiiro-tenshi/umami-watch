import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getMangaById, getMangaChapters, getChapter, getChapterPages, coverUrl, getTitle } from '../api/mangadex';
import { getComickChapters, getComickChapterImages } from '../api/comick';
import { useAuth } from '../hooks/useAuth';
import { useReadChapters } from '../hooks/useReadChapters';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import LoadingSpinner from '../components/LoadingSpinner';

const dedupByChap = (chapters) => {
  const seen = new Map();
  chapters.forEach(ch => {
    const num = ch.attributes?.chapter;
    if (num && !seen.has(num)) seen.set(num, ch);
  });
  return [...seen.values()];
};

export default function MangaReaderPage() {
  const { mangaId, chapterId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(() => localStorage.getItem('manga-read-mode') || 'vertical');
  const [rtl, setRtl] = useState(() => localStorage.getItem('manga-rtl') === 'true');
  const [dataSaver, setDataSaver] = useState(() => localStorage.getItem('manga-data-saver') === 'true');
  const [currentPage, setCurrentPage] = useState(0);
  const [allChapters, setAllChapters] = useState([]);
  const [mangaTitle, setMangaTitle] = useState('');
  const [mangaPoster, setMangaPoster] = useState('');
  const [chapterNum, setChapterNum] = useState('');
  const [showUI, setShowUI] = useState(true);
  const [showChapterSheet, setShowChapterSheet] = useState(false);

  const uiTimerRef = useRef(null);
  const resumeAppliedRef = useRef(false);
  const imgRefs = useRef([]);
  const chapterOpenTimeRef = useRef(Date.now());
  const touchStartRef = useRef(null);
  const touchStartTimeRef = useRef(null);

  const isComick = chapterId.includes('~');
  const [ckSlug, ckHid] = isComick ? chapterId.split('~') : [null, null];

  // Fetch chapter pages — ComicK (proxied images) or MangaDex (direct CDN)
  useEffect(() => {
    let dead = false;
    setLoading(true);
    setError(null);
    setCurrentPage(0);
    setPages([]);
    resumeAppliedRef.current = false;
    chapterOpenTimeRef.current = Date.now();

    (async () => {
      try {
        if (isComick) {
          const proxiedUrls = await getComickChapterImages(chapterId);
          if (dead) return;
          setPages(proxiedUrls);
        } else {
          const [pageData, chapterData] = await Promise.all([
            getChapterPages(chapterId),
            getChapter(chapterId),
          ]);
          if (dead) return;
          const list = dataSaver ? pageData.dataSaver : pageData.data;
          const quality = dataSaver ? 'data-saver' : 'data';
          setPages(list.map(f => `${pageData.baseUrl}/${quality}/${pageData.hash}/${f}`));
          setChapterNum(chapterData?.attributes?.chapter || '');
        }
      } catch (e) {
        if (!dead) setError('Failed to load chapter pages.');
      }
      if (!dead) setLoading(false);
    })();

    return () => { dead = true; };
  }, [chapterId, dataSaver]);

  // Resume to saved page after pages load
  useEffect(() => {
    if (pages.length === 0 || resumeAppliedRef.current) return;
    const resumePage = parseInt(searchParams.get('page') || '1', 10);
    if (resumePage <= 1) { resumeAppliedRef.current = true; return; }
    resumeAppliedRef.current = true;
    if (mode === 'page') {
      setCurrentPage(Math.min(resumePage - 1, pages.length - 1));
    } else {
      requestAnimationFrame(() => {
        imgRefs.current[resumePage - 1]?.scrollIntoView({ block: 'start' });
      });
    }
  }, [pages, searchParams, mode]);

  // Fetch manga title/cover + full chapter list for navigation
  useEffect(() => {
    let dead = false;

    getMangaById(mangaId).then(m => {
      if (!dead && m) {
        setMangaTitle(getTitle(m));
        setMangaPoster(coverUrl(m));
      }
    }).catch(() => {});

    if (isComick) {
      getComickChapters(ckSlug).then(chs => {
        if (!dead) {
          const deduped = dedupByChap(chs);
          setAllChapters(deduped);
          const matched = deduped.find(ch => ch.id === chapterId);
          if (matched) setChapterNum(matched.attributes?.chapter || '');
        }
      }).catch(() => {});
    } else {
      getMangaChapters(mangaId).then(raw => {
        if (!dead) setAllChapters(dedupByChap(raw));
      }).catch(() => {});
    }

    return () => { dead = true; };
  }, [mangaId, chapterId]);

  const { markChapterRead } = useReadChapters(mangaId, user);

  // Auto-mark read at last page
  useEffect(() => {
    if (!user || !chapterNum || pages.length === 0) return;
    if (currentPage === pages.length - 1) {
      markChapterRead(chapterNum, Date.now() - chapterOpenTimeRef.current);
    }
  }, [currentPage, pages.length, chapterNum, user]);

  // Save chapter entry to history (3s debounce on chapter change)
  useEffect(() => {
    if (!user || !mangaTitle || !chapterId) return;
    const timer = setTimeout(() => {
      setDoc(
        doc(db, 'users', user.uid, 'history', `manga_${mangaId}`),
        {
          contentId: mangaId,
          contentType: 'manga',
          title: mangaTitle,
          posterUrl: mangaPoster,
          chapterId,
          chapterNum,
          pageNum: currentPage + 1,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(console.error);
    }, 3000);
    return () => clearTimeout(timer);
  }, [chapterId, mangaTitle, user]);

  // Update page in history (2s debounce)
  useEffect(() => {
    if (!user || !mangaTitle || !chapterId) return;
    const timer = setTimeout(() => {
      setDoc(
        doc(db, 'users', user.uid, 'history', `manga_${mangaId}`),
        { pageNum: currentPage + 1, updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(console.error);
    }, 2000);
    return () => clearTimeout(timer);
  }, [currentPage, user, chapterId, mangaTitle]);

  // Preload next 3 pages (MangaDex CDN — zero egress)
  useEffect(() => {
    if (mode !== 'page' || pages.length === 0) return;
    const imgs = [1, 2, 3]
      .map(off => pages[currentPage + off])
      .filter(Boolean)
      .map(src => { const img = new Image(); img.src = src; return img; });
    return () => imgs.forEach(img => { img.src = ''; });
  }, [currentPage, pages, mode]);

  const currentChapterIdx = allChapters.findIndex(c => c.id === chapterId);
  const prevChapter = currentChapterIdx > 0 ? allChapters[currentChapterIdx - 1] : null;
  const nextChapter = currentChapterIdx < allChapters.length - 1 ? allChapters[currentChapterIdx + 1] : null;

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
      const forward = rtl ? (e.key === 'ArrowLeft' || e.key === 'ArrowUp') : (e.key === 'ArrowRight' || e.key === 'ArrowDown');
      const back = rtl ? (e.key === 'ArrowRight' || e.key === 'ArrowDown') : (e.key === 'ArrowLeft' || e.key === 'ArrowUp');
      if (forward) setCurrentPage(p => Math.min(p + 1, pages.length - 1));
      else if (back) setCurrentPage(p => Math.max(p - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, pages.length, resetUiTimer, rtl]);

  const handlePageTouchStart = (e) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    touchStartTimeRef.current = Date.now();
  };

  const handlePageTouchEnd = (e) => {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    const dt = Date.now() - (touchStartTimeRef.current || Date.now());
    touchStartRef.current = null;
    touchStartTimeRef.current = null;
    const isHorizontal = Math.abs(dx) >= Math.abs(dy);
    const isFarEnough = Math.abs(dx) >= 80;
    const isFlick = Math.abs(dx) / Math.max(dt, 1) > 0.3;
    if (!isHorizontal || (!isFarEnough && !isFlick)) return;
    resetUiTimer();
    const goForward = rtl ? dx > 0 : dx < 0;
    setCurrentPage(p => goForward ? Math.min(p + 1, pages.length - 1) : Math.max(p - 1, 0));
  };

  const toggleMode = () => {
    const next = mode === 'vertical' ? 'page' : 'vertical';
    setMode(next);
    localStorage.setItem('manga-read-mode', next);
  };

  const toggleRtl = () => {
    const next = !rtl;
    setRtl(next);
    localStorage.setItem('manga-rtl', String(next));
  };

  const toggleDataSaver = () => {
    const next = !dataSaver;
    setDataSaver(next);
    localStorage.setItem('manga-data-saver', String(next));
  };

  const goToChapter = (ch) => { if (ch) navigate(`/manga/${mangaId}/chapter/${ch.id}`); };
  const isLastPage = pages.length > 0 && currentPage === pages.length - 1;

  const ChapterSheet = () => (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" onClick={() => setShowChapterSheet(false)}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-surface rounded-t-2xl max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
          <span className="font-bold text-primary">Chapters</span>
          <button onClick={() => setShowChapterSheet(false)} className="text-muted text-xl leading-none px-2">✕</button>
        </div>
        <div className="overflow-y-auto flex-1">
          {allChapters.map(ch => (
            <button
              key={ch.id}
              onClick={() => { setShowChapterSheet(false); navigate(`/manga/${mangaId}/chapter/${ch.id}`); }}
              className={`w-full text-left px-4 py-3 border-b border-border flex items-center gap-2 transition-colors hover:bg-surface-raised ${ch.id === chapterId ? 'bg-accent-purple/10 text-accent-purple font-bold' : 'text-primary'}`}
            >
              {ch.id === chapterId && <span className="text-accent-purple">▶</span>}
              <span>Ch. {ch.attributes?.chapter || '?'}</span>
              {ch.attributes?.title && <span className="text-muted text-sm truncate">— {ch.attributes.title}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white" onMouseMove={resetUiTimer} onClick={resetUiTimer}>
      <div className={`fixed top-0 left-0 right-0 z-50 bg-black/90 border-b border-white/10 transition-opacity duration-300 ${showUI || mode === 'vertical' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="px-3 sm:px-4 py-1.5 flex items-center gap-2 sm:gap-3">
          <Link to={`/manga/${mangaId}`} className="text-white/60 hover:text-white transition-colors text-sm font-semibold flex items-center gap-1 shrink-0 py-3 pr-2">
            ← Back
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-xs sm:text-sm truncate">{mangaTitle}</p>
            <p className="text-white/50 text-xs hidden sm:block">{chapterNum ? `Chapter ${chapterNum}` : ''}</p>
          </div>

          {allChapters.length > 0 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setShowChapterSheet(true); }}
                className="sm:hidden bg-white/10 border border-white/20 rounded px-3 py-2 text-sm text-white min-w-[44px] min-h-[44px] flex items-center gap-1"
              >
                Ch.{chapterNum} <span className="text-white/50">▾</span>
              </button>
              <select
                value={chapterId}
                onChange={e => navigate(`/manga/${mangaId}/chapter/${e.target.value}`)}
                className="hidden sm:block bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm text-white focus:outline-none"
              >
                {allChapters.map(ch => (
                  <option key={ch.id} value={ch.id}>Ch. {ch.attributes?.chapter || '?'}</option>
                ))}
              </select>
            </>
          )}

          <button onClick={toggleMode} className="bg-white/10 hover:bg-white/20 border border-white/20 rounded min-w-[44px] min-h-[44px] flex items-center justify-center px-2.5 text-xs font-semibold transition-colors shrink-0">
            <span className="hidden sm:inline">{mode === 'vertical' ? '📄 Page' : '📜 Scroll'}</span>
            <span className="sm:hidden">{mode === 'vertical' ? '📄' : '📜'}</span>
          </button>

          {mode === 'page' && (
            <button
              onClick={toggleRtl}
              className={`border rounded min-w-[44px] min-h-[44px] flex items-center justify-center px-2.5 text-xs font-semibold transition-colors shrink-0 ${rtl ? 'bg-accent-purple border-accent-purple text-white' : 'bg-white/10 border-white/20 hover:bg-white/20'}`}
            >
              {rtl ? '←RTL' : 'LTR→'}
            </button>
          )}

          {!isComick && (
            <button
              onClick={toggleDataSaver}
              className={`border rounded min-w-[44px] min-h-[44px] flex items-center justify-center px-2.5 text-xs font-semibold transition-colors shrink-0 ${dataSaver ? 'bg-accent-purple border-accent-purple text-white' : 'bg-white/10 border-white/20 hover:bg-white/20'}`}
              title="Data saver (lower quality)"
            >
              <span className="hidden sm:inline">{dataSaver ? 'HQ Off' : 'HQ On'}</span>
              <span className="sm:hidden">{dataSaver ? '🔋' : '✨'}</span>
            </button>
          )}
        </div>
      </div>

      {showChapterSheet && <ChapterSheet />}

      {loading ? (
        <div className="flex items-center justify-center h-screen"><LoadingSpinner /></div>
      ) : error || pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-screen gap-4 text-center px-6">
          <p className="text-red-400 font-semibold">{error || 'No pages found for this chapter.'}</p>
          {error && <button onClick={() => window.location.reload()} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded text-sm">Retry</button>}
          <Link to={`/manga/${mangaId}`} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded text-sm">← Back to chapters</Link>
        </div>
      ) : mode === 'vertical' ? (
        <div className="pt-16 pb-24 flex flex-col items-center">
          {pages.map((url, i) => (
            <img key={i} src={url} alt={`Page ${i + 1}`} className="w-full max-w-2xl block mb-px"
              loading={i < 3 ? 'eager' : 'lazy'} ref={el => { imgRefs.current[i] = el; }} />
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
        <div className="flex items-center justify-center h-screen pt-14 select-none" onTouchStart={handlePageTouchStart} onTouchEnd={handlePageTouchEnd}>
          {pages[currentPage] && (
            <img src={pages[currentPage]} alt={`Page ${currentPage + 1}`} className="max-h-[calc(100vh-80px)] max-w-full object-contain" draggable={false} />
          )}
          <button onClick={() => { resetUiTimer(); setCurrentPage(p => rtl ? Math.min(p + 1, pages.length - 1) : Math.max(p - 1, 0)); }}
            className="absolute left-0 top-0 w-1/3 h-full opacity-0" aria-label={rtl ? 'Next page' : 'Previous page'} />
          <button onClick={() => { resetUiTimer(); setCurrentPage(p => rtl ? Math.max(p - 1, 0) : Math.min(p + 1, pages.length - 1)); }}
            className="absolute right-0 top-0 w-1/3 h-full opacity-0" aria-label={rtl ? 'Previous page' : 'Next page'} />

          {isLastPage && (
            <div className="absolute inset-x-0 bottom-20 flex justify-center px-4 pointer-events-none">
              <div className="bg-black/90 border border-white/20 rounded-2xl p-6 max-w-sm w-full text-center pointer-events-auto shadow-2xl">
                <div className="text-green-400 text-2xl mb-2">✓</div>
                <p className="font-bold text-white mb-1">End of Chapter {chapterNum}</p>
                {nextChapter ? (
                  <>
                    <p className="text-white/50 text-sm mb-4">
                      Up next: Ch. {nextChapter.attributes?.chapter}
                      {nextChapter.attributes?.title ? ` — ${nextChapter.attributes.title}` : ''}
                    </p>
                    <div className="flex gap-3 justify-center">
                      <button onClick={() => goToChapter(nextChapter)} className="bg-accent-purple hover:opacity-90 text-white font-bold px-5 py-2.5 rounded-lg text-sm">Next Chapter →</button>
                      <Link to={`/manga/${mangaId}`} className="bg-white/10 hover:bg-white/20 text-white font-semibold px-5 py-2.5 rounded-lg text-sm">Chapter List</Link>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-white/50 text-sm mb-4">You're all caught up!</p>
                    <Link to={`/manga/${mangaId}`} className="bg-white/10 hover:bg-white/20 text-white font-semibold px-5 py-2.5 rounded-lg text-sm inline-block">← Back to manga</Link>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'page' && (
        <div className={`fixed bottom-0 left-0 right-0 z-50 bg-black/90 border-t border-white/10 px-4 py-4 flex items-center gap-4 transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {rtl
            ? <button onClick={() => goToChapter(nextChapter)} disabled={!nextChapter} className="text-white/50 hover:text-white disabled:opacity-20 text-sm font-semibold px-4 py-3 shrink-0">Next Ch. →</button>
            : <button onClick={() => goToChapter(prevChapter)} disabled={!prevChapter} className="text-white/50 hover:text-white disabled:opacity-20 text-sm font-semibold px-4 py-3 shrink-0">← Prev Ch.</button>
          }
          <div className="flex-1 flex flex-col items-center gap-1">
            <input type="range" min={0} max={pages.length - 1} value={currentPage}
              onChange={e => setCurrentPage(Number(e.target.value))}
              className="w-full h-2 accent-accent-purple cursor-pointer" style={{ touchAction: 'none' }} />
            <span className="text-xs text-white/50">{currentPage + 1} / {pages.length}</span>
          </div>
          {rtl
            ? <button onClick={() => goToChapter(prevChapter)} disabled={!prevChapter} className="text-white/50 hover:text-white disabled:opacity-20 text-sm font-semibold px-4 py-3 shrink-0">← Prev Ch.</button>
            : <button onClick={() => goToChapter(nextChapter)} disabled={!nextChapter} className="text-white/50 hover:text-white disabled:opacity-20 text-sm font-semibold px-4 py-3 shrink-0">Next Ch. →</button>
          }
        </div>
      )}
    </div>
  );
}
