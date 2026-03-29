import { Link } from 'react-router-dom';

export default function ContentCard({ id, title, posterUrl, contentType, rating, className }) {
  const badgeColor =
    contentType === 'anime' ? 'bg-accent-teal' :
    contentType === 'movie' ? 'bg-accent-blue' :
    contentType === 'manga' ? 'bg-accent-purple' : 'bg-accent-orange';

  const linkTo =
    contentType === 'tv' ? `/tv/${id}` :
    contentType === 'movie' ? `/movie/${id}` :
    contentType === 'manga' ? `/manga/${id}` :
    `/anime/${id}${title ? `?title=${encodeURIComponent(title)}` : ''}`;

  const sizeClass = className ?? 'w-32 sm:w-40 h-48 sm:h-60 shrink-0';

  return (
    <Link to={linkTo} className={`relative block ${sizeClass} group rounded-lg overflow-hidden border border-border bg-surface transition-transform hover:scale-[1.04]`}>
      <img src={posterUrl || '/placeholder.png'} alt={title} className="w-full h-full object-cover" loading="lazy" />
      
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-100 group-hover:from-black/90 transition-opacity flex flex-col justify-end p-2">
        <h3 className="text-white font-bold text-sm truncate w-full shadow-sm">{title}</h3>
        <div className="flex items-center justify-between mt-1 text-xs font-semibold">
          <span className={`${badgeColor} text-white px-1.5 py-0.5 rounded shadow-sm capitalize`}>{contentType}</span>
          {rating ? <span className="text-amber-300 drop-shadow-md">★ {typeof rating === 'number' ? rating.toFixed(1) : rating}</span> : null}
        </div>
      </div>
      
      {/* Play Icon Hover */}
      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-12 h-12 bg-accent-blue rounded-full flex items-center justify-center text-white shadow-lg">
          <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        </div>
      </div>
    </Link>
  );
}
