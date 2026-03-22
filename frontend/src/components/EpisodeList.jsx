import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function EpisodeList({ episodes, animeId, currentEpisodeId, roomId }) {
  const [page, setPage] = useState(0);
  const perPage = 100;

  if (!episodes || episodes.length === 0) return <p className="text-secondary py-4 font-medium">No episodes available.</p>;

  // Pagination for animes with >100 episodes
  const totalPages = Math.ceil(episodes.length / perPage);
  const currentEpisodes = episodes.slice(page * perPage, (page + 1) * perPage);

  return (
    <div className="mt-6 border border-border bg-surface rounded-xl overflow-hidden shadow-sm">
      <div className="bg-surface-raised p-4 border-b border-border flex justify-between items-center">
        <h3 className="font-bold text-primary">Episodes ({episodes.length})</h3>
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
      
      <div className="max-h-[60vh] md:max-h-96 overflow-y-auto divide-y divide-border-subtle">
        {currentEpisodes.map((ep) => {
          const isCurrent = ep.id === currentEpisodeId;
          return (
            <div key={ep.id} className={`px-4 py-3 flex items-center justify-between hover:bg-surface-raised transition-colors ${isCurrent ? 'bg-red-50/50' : ''}`}>
              <div className="flex-1">
                <span className="text-muted font-bold mr-3 text-sm">EP {ep.number}</span>
                <span className={`font-semibold ${isCurrent ? 'text-accent-teal' : 'text-primary'}`}>{ep.title || `Episode ${ep.number}`}</span>
                {ep.isFiller && <span className="ml-2 text-xs bg-orange-100 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded font-semibold">Filler</span>}
              </div>
              <Link to={`/watch?type=anime&animeId=${animeId}&aniwatchEpisodeId=${encodeURIComponent(ep.id)}&epNum=${ep.number}${roomId ? `&roomId=${roomId}` : ''}`}
                className={`shrink-0 px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-transform hover:scale-105 ${isCurrent ? 'bg-accent-teal text-white' : 'bg-accent-blue hover:bg-red-700 text-white'}`}>
                {isCurrent ? 'Playing' : 'Watch'}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
