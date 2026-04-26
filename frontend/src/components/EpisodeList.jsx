import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWatchedEps } from '../hooks/useWatchedEps';
import EpisodeContextMenu from './EpisodeContextMenu';

export default function EpisodeList({ episodes, animeId, currentEpisodeId, roomId, onWatchParty, user, animeTitle, posterUrl }) {
  const [page, setPage] = useState(0);
  const [creatingFor, setCreatingFor] = useState(null);
  const [menu, setMenu] = useState(null); // { x, y, epNum }
  const perPage = 100;

  const { watchedEps, toggleWatched, markAllWatched, markAllUnwatched } = useWatchedEps(animeId, user, animeTitle, posterUrl);

  if (!episodes || episodes.length === 0) return <p className="text-secondary py-4 font-medium">No episodes available.</p>;

  const totalPages = Math.ceil(episodes.length / perPage);
  const currentEpisodes = episodes.slice(page * perPage, (page + 1) * perPage);
  const allWatched = episodes.length > 0 && episodes.every(ep => watchedEps.has(ep.number));

  const handleContextMenu = (e, epNum) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, epNum });
  };

  return (
    <div className="mt-6 border border-border bg-surface rounded-xl overflow-hidden shadow-sm">
      <div className="bg-surface-raised p-4 border-b border-border flex justify-between items-center gap-3">
        <h3 className="font-bold text-primary">Episodes ({episodes.length})</h3>
        <div className="flex items-center gap-2">
          {user && (
            <button
              onClick={() => allWatched ? markAllUnwatched() : markAllWatched(episodes)}
              className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-surface transition-colors text-secondary font-medium"
            >
              {allWatched ? 'Unwatch all' : 'Watch all'}
            </button>
          )}
          {totalPages > 1 && (
            <select value={page} onChange={(e) => setPage(Number(e.target.value))}
              className="bg-surface border border-border rounded text-sm p-2 focus:outline-none focus:ring-1 focus:ring-accent-teal text-secondary font-medium outline-none">
              {Array.from({ length: totalPages }).map((_, i) => {
                const start = i * perPage + 1;
                const end = Math.min((i + 1) * perPage, episodes.length);
                return <option key={i} value={i}>{start} - {end}</option>;
              })}
            </select>
          )}
        </div>
      </div>

      <div className="max-h-[60vh] md:max-h-96 overflow-y-auto scrollbar-themed divide-y divide-border-subtle">
        {currentEpisodes.map((ep) => {
          const isCurrent = ep.id === currentEpisodeId;
          const watched = watchedEps.has(ep.number);
          return (
            <div
              key={ep.id}
              onContextMenu={(e) => handleContextMenu(e, ep.number)}
              className={`px-4 py-3 flex items-center justify-between hover:bg-surface-raised transition-colors ${isCurrent ? 'bg-red-50/50' : ''}`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {watched ? (
                  <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <span className="w-3.5 flex-shrink-0" />
                )}
                <span className="text-muted font-bold text-sm flex-shrink-0">EP {ep.number}</span>
                <span className="text-muted flex-shrink-0">·</span>
                <div className="min-w-0 flex-1">
                  <span className={`font-semibold truncate block ${isCurrent ? 'text-accent-teal' : watched ? 'text-muted' : 'text-primary'}`}>
                    {ep.title || `Episode ${ep.number}`}
                    {ep.isFiller && <span className="ml-1 text-xs bg-orange-100 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded font-semibold">Filler</span>}
                  </span>
                  {ep.airdate && (
                    <span className="text-xs text-muted">
                      {new Date(ep.airdate) <= new Date() ? 'Released' : `Release: ${new Date(ep.airdate).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}`}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {onWatchParty && !roomId && (
                  <button
                    onClick={async () => {
                      setCreatingFor(ep.number);
                      await onWatchParty(ep.number);
                      setCreatingFor(null);
                    }}
                    disabled={creatingFor === ep.number}
                    className="px-3 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-transform hover:scale-105 bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    {creatingFor === ep.number ? '...' : 'Party'}
                  </button>
                )}
                <Link
                  to={`/watch?type=anime&kitsuId=${animeId}&epNum=${ep.number}${roomId ? `&roomId=${roomId}` : ''}`}
                  className={`px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-transform hover:scale-105 ${isCurrent ? 'bg-accent-teal text-white' : 'bg-accent-blue hover:bg-red-700 text-white'}`}
                >
                  {isCurrent ? 'Playing' : 'Watch'}
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {menu && (
        <EpisodeContextMenu
          x={menu.x}
          y={menu.y}
          epNum={menu.epNum}
          isWatched={watchedEps.has(menu.epNum)}
          onToggle={toggleWatched}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
