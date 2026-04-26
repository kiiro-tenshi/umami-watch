import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getMonthAiringSchedule } from '../api/anilist';
import LoadingSpinner from './LoadingSpinner';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function AiringCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(today.getDate());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMonthAiringSchedule(year, month)
      .then(data => {
        if (cancelled) return;
        setSchedules(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSchedules([]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [year, month]);

  // Group by day-of-month
  const dayMap = useMemo(() => {
    const map = {};
    for (const s of schedules) {
      const day = new Date(s.airingAt * 1000).getDate();
      if (!map[day]) map[day] = [];
      map[day].push(s);
    }
    return map;
  }, [schedules]);

  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  };

  const isToday = (day) =>
    year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate();

  const selectedEpisodes = selectedDay ? (dayMap[selectedDay] || []) : [];

  return (
    <div className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <h2 className="font-bold text-primary text-base">Airing Schedule</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-raised text-secondary hover:text-primary transition-colors text-lg leading-none"
          >‹</button>
          <span className="text-sm font-semibold text-primary w-32 text-center">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-raised text-secondary hover:text-primary transition-colors text-lg leading-none"
          >›</button>
        </div>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 border-b border-border-subtle">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-[11px] font-semibold text-muted py-2 tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="py-16 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="grid grid-cols-7 border-t border-l border-border-subtle/40">
          {/* Leading empty cells */}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div
              key={`pre-${i}`}
              className="min-h-[76px] border-r border-b border-border-subtle/40 bg-surface-raised/10"
            />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const eps = dayMap[day] || [];
            const selected = selectedDay === day;
            const current = isToday(day);

            return (
              <div
                key={day}
                onClick={() => setSelectedDay(selected ? null : day)}
                className={`min-h-[76px] border-r border-b border-border-subtle/40 p-1.5 cursor-pointer transition-colors select-none
                  ${selected ? 'bg-surface-raised' : 'hover:bg-surface-raised/50'}`}
              >
                <div className={`text-[11px] font-bold mb-1 w-5 h-5 flex items-center justify-center rounded-full
                  ${current ? 'bg-accent-teal text-white' : 'text-secondary'}`}>
                  {day}
                </div>
                <div className="flex flex-wrap gap-0.5">
                  {eps.slice(0, 4).map((ep, idx) => (
                    <img
                      key={idx}
                      src={ep.media.coverImage.large}
                      alt={ep.media.title.english || ep.media.title.romaji}
                      title={ep.media.title.english || ep.media.title.romaji}
                      className="w-5 h-5 rounded-sm object-cover"
                    />
                  ))}
                  {eps.length > 4 && (
                    <span className="text-[10px] text-muted self-end leading-none">+{eps.length - 4}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected day episode list */}
      {selectedDay && !loading && (
        <div className="border-t border-border-subtle">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle/50">
            <h3 className="text-sm font-bold text-primary">
              {MONTH_NAMES[month - 1]} {selectedDay}
            </h3>
            <span className="text-xs text-muted">
              {selectedEpisodes.length} episode{selectedEpisodes.length !== 1 ? 's' : ''}
            </span>
          </div>
          {selectedEpisodes.length === 0 ? (
            <p className="text-sm text-muted px-4 py-4">No episodes scheduled.</p>
          ) : (
            <div className="overflow-y-auto max-h-60 scrollbar-themed">
              {selectedEpisodes.map((ep, idx) => {
                const airTime = new Date(ep.airingAt * 1000);
                return (
                  <Link
                    key={idx}
                    to={`/anime/${ep.media.id}`}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-surface-raised transition-colors group"
                  >
                    <img
                      src={ep.media.coverImage.large}
                      alt=""
                      className="w-8 h-11 object-cover rounded flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary truncate group-hover:text-accent-teal transition-colors">
                        {ep.media.title.english || ep.media.title.romaji}
                      </p>
                      <p className="text-xs text-muted">Episode {ep.episode}</p>
                    </div>
                    <time className="text-xs text-muted flex-shrink-0 tabular-nums">
                      {airTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
