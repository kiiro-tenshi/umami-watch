import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchAniList } from '../api/anilist';
import { searchContent, tmdbImage } from '../api/tmdb';

export default function RoomContentModal({ roomId, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const [anime, movies, tv] = await Promise.all([
          searchAniList(query, 1, 4).catch(() => []),
          searchContent(query, 'movie').catch(() => ({ results: [] })),
          searchContent(query, 'tv').catch(() => ({ results: [] })),
        ]);
        setResults([
          ...anime.map(a => ({ id: String(a.id), type: 'anime', title: a.title.english || a.title.romaji, poster: a.coverImage?.large })),
          ...(movies.results || []).slice(0, 3).map(m => ({ id: String(m.id), type: 'movie', title: m.title, poster: tmdbImage(m.poster_path, 'w92') })),
          ...(tv.results || []).slice(0, 3).map(s => ({ id: String(s.id), type: 'tv', title: s.name, poster: tmdbImage(s.poster_path, 'w92') })),
        ]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  const handleSelect = (item) => {
    if (item.type === 'anime') {
      navigate(`/anime/${item.id}?roomId=${roomId}`);
    } else {
      navigate(`/watch?roomId=${roomId}&type=${item.type}&tmdbId=${item.id}`);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-border flex justify-between items-center bg-surface-raised rounded-t-2xl flex-shrink-0">
          <h3 className="font-bold text-primary text-lg">Select Content to Watch</h3>
          <button onClick={onClose} className="text-muted hover:text-primary text-2xl leading-none">&times;</button>
        </div>

        <div className="p-4 flex-shrink-0">
          <input
            autoFocus
            type="text"
            placeholder="Search anime, movies, TV shows..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full bg-page border border-border rounded-xl px-4 py-3 text-primary focus:outline-none focus:ring-2 focus:ring-accent-teal"
          />
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border-subtle">
          {searching && <p className="text-center text-muted p-6">Searching...</p>}
          {!searching && query && results.length === 0 && <p className="text-center text-muted p-6">No results found.</p>}
          {!query && (
            <div className="p-6 text-center text-muted text-sm">
              <p className="text-4xl mb-3">🔍</p>
              <p>Search for something to watch together</p>
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.type}-${r.id}-${i}`}
              onClick={() => handleSelect(r)}
              className="w-full flex items-center gap-3 p-3 hover:bg-surface-raised transition-colors text-left"
            >
              <img src={r.poster || ''} className="w-10 h-14 object-cover rounded bg-page border border-border flex-shrink-0" alt="" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-primary text-sm truncate">{r.title}</p>
                <span className="text-xs font-bold uppercase text-muted tracking-wider">{r.type}</span>
              </div>
              <span className="text-xs text-accent-teal font-bold flex-shrink-0">Select →</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
