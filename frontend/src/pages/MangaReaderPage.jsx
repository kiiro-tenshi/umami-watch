import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getChapterPages, getMangaChapters, coverUrl, getCoverFilename, getTitle } from '../api/mangadex';
import { getMangaById } from '../api/mangadex';
import LoadingSpinner from '../components/LoadingSpinner';

export default function MangaReaderPage() {
  const { mangaId, chapterId } = useParams();
  const navigate = useNavigate();

  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(() => localStorage.getItem('manga-read-mode') || 'vertical'); // 'vertical' | 'page'
  const [currentPage, setCurrentPage] = useState(0);
  const [allChapters, setAllChapters] = useState([]);
  const [mangaTitle, setMangaTitle] = useState('');
  const [chapterNum, setChapterNum] = useState('');
  const [dataSaver, setDataSaver] = useState(() => localStorage.getItem('manga-data-saver') === 'true');
  const [showUI, setShowUI] = useState(true);
  const uiTimerRef = useRef(null);

  // Fetch chapter pages
  useEffect(() => {
    const fetchPages = async () => {
      setLoading(true);
      setError(null);
      setCurrentPage(0);
      try {
        const pageData = await getChapterPages(chapterId);
        const list = dataSaver ? pageData.dataSaver : pageData.data;
        const quality = dataSaver ? 'data-saver' : 'data';
        setPages(list.map(f => `${pageData.baseUrl}/${quality}/${pageData.hash}/${f}`));
      } catch (e) {
        setError('Failed to load chapter pages.');
      }
      setLoading(false);
    };
    fetchPages();
  }, [chapterId, dataSaver]);

  // Fetch manga title + chapter list for navigation
  useEffect(() => {
    getMangaById(mangaId)
      .then(m => setMangaTitle(getTitle(m)))
      .catch(() => {});

    const fetchAllChapters = async () => {
      const { data } = await getMangaChapters(mangaId, 0, 100).catch(() => ({ data: [] }));
      // Deduplicate by chapter number
      const seen = new Map();
      data.forEach(ch => {
        const num = ch.attributes?.chapter;
        if (num && !seen.has(num)) seen.set(num, ch);
      });
      const sorted = [...seen.values()];
      setAllChapters(sorted);
      const cur = sorted.find(c => c.id === chapterId);
      if (cur) setChapterNum(cur.attributes?.chapter || '');
    };
    fetchAllChapters();
  }, [mangaId, chapterId]);

  const currentChapterIdx = allChapters.findIndex(c => c.id === chapterId);
  const prevChapter = currentChapterIdx > 0 ? allChapters[currentChapterIdx - 1] : null;
  const nextChapter = currentChapterIdx < allChapters.length - 1 ? allChapters[currentChapterIdx + 1] : null;

  // Auto-hide UI after 3s of inactivity in page mode
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

  // Keyboard navigation in page mode
  useEffect(() => {
    if (mode !== 'page') return;
    const onKey = (e) => {
      resetUiTimer();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setCurrentPage(p => Math.min(p + 1, pages.length - 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setCurrentPage(p => Math.max(p - 1, 0));
      }
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

  const goToChapter = (ch) => {
    if (ch) navigate(`/manga/${mangaId}/chapter/${ch.id}`);
  };

  return (
    <div
      className="min-h-screen bg-black text-white"
      onMouseMove={resetUiTimer}
      onClick={resetUiTimer}
    >
      {/* Top bar */}
      <div className={`fixed top-0 left-0 right-0 z-50 bg-black/90 border-b border-white/10 transition-opacity duration-300 ${showUI || mode === 'vertical' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Row 1: Back + title */}
        <div className="px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-3">
          <Link to={`/manga/${mangaId}`} className="text-white/60 hover:text-white transition-colors text-sm font-semibold flex items-center gap-1 shrink-0">
            ← Back
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-xs sm:text-sm truncate">{mangaTitle}</p>
            <p className="text-white/50 text-xs hidden sm:block">{chapterNum ? `Chapter ${chapterNum}` : ''}</p>
          </div>
          {/* Chapter selector — always visible */}
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
          {/* Mode + data saver — icon-only on very small screens */}
          <button
            onClick={toggleMode}
            className="bg-white/10 hover:bg-white/20 border border-white/20 rounded p-1.5 sm:px-2.5 sm:py-1 text-xs font-semibold transition-colors shrink-0"
            title="Toggle reading mode"
          >
            <span className="hidden sm:inline">{mode === 'vertical' ? '📄 Page' : '📜 Scroll'}</span>
            <span className="sm:hidden">{mode === 'vertical' ? '📄' : '📜'}</span>
          </button>
          <button
            onClick={toggleDataSaver}
            className={`border rounded p-1.5 sm:px-2.5 sm:py-1 text-xs font-semibold transition-colors shrink-0 ${dataSaver ? 'bg-accent-purple border-accent-purple text-white' : 'bg-white/10 border-white/20 hover:bg-white/20'}`}
            title="Toggle data saver (lower quality)"
          >
            <span className="hidden sm:inline">{dataSaver ? 'HQ Off' : 'HQ On'}</span>
            <span className="sm:hidden">{dataSaver ? '🔋' : '✨'}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-screen">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-screen gap-4">
          <p className="text-red-400 font-semibold">{error}</p>
          <button onClick={() => window.location.reload()} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded text-sm">Retry</button>
        </div>
      ) : mode === 'vertical' ? (
        // Vertical scroll mode
        <div className="pt-16 pb-24 flex flex-col items-center">
          {pages.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`Page ${i + 1}`}
              className="w-full max-w-2xl"
              loading={i < 3 ? 'eager' : 'lazy'}
            />
          ))}
          {/* Chapter nav at bottom */}
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
        // Page-by-page mode
        <div className="flex items-center justify-center h-screen pt-10 select-none">
          {pages[currentPage] && (
            <img
              src={pages[currentPage]}
              alt={`Page ${currentPage + 1}`}
              className="max-h-[calc(100vh-80px)] max-w-full object-contain"
              draggable={false}
            />
          )}

          {/* Left/right tap areas */}
          <button
            onClick={() => { resetUiTimer(); setCurrentPage(p => Math.max(p - 1, 0)); }}
            className="absolute left-0 top-0 w-1/3 h-full opacity-0"
            aria-label="Previous page"
          />
          <button
            onClick={() => { resetUiTimer(); setCurrentPage(p => Math.min(p + 1, pages.length - 1)); }}
            className="absolute right-0 top-0 w-1/3 h-full opacity-0"
            aria-label="Next page"
          />
        </div>
      )}

      {/* Bottom bar for page mode */}
      {mode === 'page' && (
        <div className={`fixed bottom-0 left-0 right-0 z-50 bg-black/90 border-t border-white/10 px-4 py-3 flex items-center gap-3 transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <button
            onClick={() => goToChapter(prevChapter)}
            disabled={!prevChapter}
            className="text-white/50 hover:text-white disabled:opacity-20 transition-colors text-sm font-semibold"
          >
            ← Prev Ch.
          </button>
          <div className="flex-1 flex flex-col items-center gap-1">
            <input
              type="range"
              min={0}
              max={pages.length - 1}
              value={currentPage}
              onChange={e => setCurrentPage(Number(e.target.value))}
              className="w-full accent-accent-purple cursor-pointer"
            />
            <span className="text-xs text-white/50">{currentPage + 1} / {pages.length}</span>
          </div>
          <button
            onClick={() => goToChapter(nextChapter)}
            disabled={!nextChapter}
            className="text-white/50 hover:text-white disabled:opacity-20 transition-colors text-sm font-semibold"
          >
            Next Ch. →
          </button>
        </div>
      )}
    </div>
  );
}
