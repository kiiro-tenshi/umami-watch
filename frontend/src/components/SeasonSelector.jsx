import { tmdbImage } from '../api/tmdb';
import { Link } from 'react-router-dom';

export default function SeasonSelector({ seasons, selectedSeason, onSeasonChange, episodes, tmdbId }) {
  if (!seasons || seasons.length === 0) return null;

  return (
    <div className="mt-6 border border-border bg-surface rounded-xl overflow-hidden shadow-sm">
      <div className="bg-surface-raised p-4 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="font-bold text-primary">Seasons & Episodes</h3>
        <select value={selectedSeason} onChange={e => onSeasonChange(Number(e.target.value))}
          className="bg-surface border border-border rounded-lg text-sm font-semibold p-2 focus:ring-2 focus:ring-accent-purple text-secondary outline-none w-full sm:w-auto">
          {seasons.map(s => (
            <option key={s.id} value={s.season_number}>{s.name} ({s.episode_count} Episodes)</option>
          ))}
        </select>
      </div>

      <div className="max-h-[65vh] md:max-h-[600px] overflow-y-auto scrollbar-themed divide-y divide-border-subtle">
        {(!episodes || episodes.length === 0) ? (
          <p className="p-8 text-center text-muted font-medium">Select a season to view episodes.</p>
        ) : (
          episodes.map(ep => (
            <div key={ep.id} className="p-4 flex flex-col sm:flex-row gap-4 hover:bg-surface-raised transition-colors group">
              <div className="w-full sm:w-48 h-28 bg-surface-raised shrink-0 rounded-lg overflow-hidden border border-border">
                {ep.still_path ? (
                  <img src={tmdbImage(ep.still_path, 'w500')} alt={ep.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted text-sm font-semibold">No Image</div>
                )}
              </div>
              <div className="flex-1 flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base font-bold text-muted">E{ep.episode_number}</span>
                  <h4 className="font-bold text-primary text-base">{ep.name}</h4>
                </div>
                <p className="text-secondary text-sm line-clamp-2 md:line-clamp-3 mb-3">{ep.overview || 'No synopsis available.'}</p>
                <div className="mt-auto flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted bg-surface border border-border px-2 py-0.5 rounded">{ep.air_date}</span>
                  <Link to={`/watch?type=tv&tmdbId=${tmdbId}&season=${selectedSeason}&episode=${ep.episode_number}`}
                    className="bg-accent-purple hover:bg-violet-700 text-white text-sm font-bold py-2.5 px-4 rounded-lg shadow-sm transition-transform hover:scale-105">
                    Watch Episode
                  </Link>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
