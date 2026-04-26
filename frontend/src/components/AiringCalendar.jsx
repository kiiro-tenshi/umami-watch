import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getWeekAiringSchedule } from '../api/anilist';
import LoadingSpinner from './LoadingSpinner';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getWeekStart(ref = new Date()) {
  const d = new Date(ref);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatWeekRange(weekStart) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const s = weekStart, e = weekEnd;
  if (s.getMonth() === e.getMonth()) {
    return `${MONTH_SHORT[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${MONTH_SHORT[s.getMonth()]} ${s.getDate()} – ${MONTH_SHORT[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
}

export default function AiringCalendar() {
  const today = new Date();
  const [weekStart, setWeekStart] = useState(() => getWeekStart());
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getWeekAiringSchedule(weekStart)
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
  }, [weekStart]);

  // Group by day, sort each day by popularity desc, cap at 5
  const dayMap = useMemo(() => {
    const map = {};
    for (const s of schedules) {
      const key = dateKey(new Date(s.airingAt * 1000));
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (b.media.popularity || 0) - (a.media.popularity || 0));
      map[key] = map[key].slice(0, 5);
    }
    return map;
  }, [schedules]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const prevWeek = () => setWeekStart(ws => {
    const d = new Date(ws);
    d.setDate(d.getDate() - 7);
    return d;
  });

  const nextWeek = () => setWeekStart(ws => {
    const d = new Date(ws);
    d.setDate(d.getDate() + 7);
    return d;
  });

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="font-bold text-primary text-base">Airing This Week</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={prevWeek}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-raised text-secondary hover:text-primary transition-colors text-lg leading-none"
          >‹</button>
          <span className="text-xs font-semibold text-primary w-44 text-center">
            {formatWeekRange(weekStart)}
          </span>
          <button
            onClick={nextWeek}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-raised text-secondary hover:text-primary transition-colors text-lg leading-none"
          >›</button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {/* Desktop: 7-column grid */}
          <div className="hidden md:grid grid-cols-7 divide-x divide-border">
            {days.map((day, i) => {
              const key = dateKey(day);
              const eps = dayMap[key] || [];
              const isToday = dateKey(day) === dateKey(today);

              return (
                <div key={i} className={`flex flex-col ${isToday ? 'bg-surface-raised/50' : ''}`}>
                  <div className={`px-2 py-2 text-center border-b border-border ${isToday ? 'bg-accent-teal/10' : ''}`}>
                    <p className={`text-[10px] font-bold tracking-wide ${isToday ? 'text-accent-teal' : 'text-muted'}`}>
                      {DAY_NAMES[i]}
                    </p>
                    <p className={`text-sm font-bold ${isToday ? 'text-accent-teal' : 'text-secondary'}`}>
                      {MONTH_SHORT[day.getMonth()]} {day.getDate()}
                    </p>
                  </div>
                  <div className="flex flex-col divide-y divide-border">
                    {eps.length === 0 ? (
                      <p className="text-[11px] text-muted text-center py-5 px-2">—</p>
                    ) : (
                      eps.map((ep, idx) => {
                        const airTime = new Date(ep.airingAt * 1000);
                        const title = ep.media.title.english || ep.media.title.romaji;
                        return (
                          <Link
                            key={idx}
                            to={`/anime/${ep.media.id}?title=${encodeURIComponent(title)}`}
                            className="flex items-center gap-2 px-2 py-2 hover:bg-surface-raised transition-colors group"
                          >
                            <img
                              src={ep.media.coverImage.large}
                              alt=""
                              className="w-8 h-11 object-cover rounded flex-shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-primary group-hover:text-accent-teal transition-colors line-clamp-2 leading-tight">
                                {title}
                              </p>
                              <p className="text-[10px] text-muted mt-0.5">Ep {ep.episode}</p>
                              <p className="text-[10px] text-muted tabular-nums">
                                {airTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </Link>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile: vertical list of day sections */}
          <div className="md:hidden flex flex-col divide-y divide-border">
            {days.map((day, i) => {
              const key = dateKey(day);
              const eps = dayMap[key] || [];
              const isToday = dateKey(day) === dateKey(today);

              return (
                <div key={i}>
                  <div className={`px-3 py-2 flex items-center gap-2 ${isToday ? 'bg-accent-teal/10' : 'bg-surface-raised/30'}`}>
                    <span className={`text-xs font-bold ${isToday ? 'text-accent-teal' : 'text-muted'}`}>{DAY_NAMES[i]}</span>
                    <span className={`text-sm font-bold ${isToday ? 'text-accent-teal' : 'text-secondary'}`}>
                      {MONTH_SHORT[day.getMonth()]} {day.getDate()}
                    </span>
                  </div>
                  {eps.length === 0 ? (
                    <p className="text-[11px] text-muted px-3 py-3">—</p>
                  ) : (
                    <div className="flex gap-3 overflow-x-auto scrollbar-hide px-3 py-3">
                      {eps.map((ep, idx) => {
                        const title = ep.media.title.english || ep.media.title.romaji;
                        return (
                          <Link
                            key={idx}
                            to={`/anime/${ep.media.id}?title=${encodeURIComponent(title)}`}
                            className="flex-shrink-0 w-[80px] group"
                          >
                            <img
                              src={ep.media.coverImage.large}
                              alt=""
                              className="w-[80px] h-[112px] object-cover rounded"
                            />
                            <p className="text-[10px] font-semibold text-primary group-hover:text-accent-teal transition-colors line-clamp-2 leading-tight mt-1">
                              {title}
                            </p>
                            <p className="text-[10px] text-muted">Ep {ep.episode}</p>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
