import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function EpisodeContextMenu({ x, y, epNum, isWatched, onToggle, onClose, watchedLabel = 'Mark as watched', unwatchedLabel = 'Mark as unwatched' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onClick = () => onClose();
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed z-[9999] bg-surface border border-border rounded-lg shadow-xl py-1 min-w-[170px] text-sm"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="w-full px-4 py-2 text-left hover:bg-surface-raised transition-colors flex items-center gap-2.5 text-primary"
        onClick={() => { onToggle(epNum); onClose(); }}
      >
        {isWatched ? (
          <>
            <svg className="w-4 h-4 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            {unwatchedLabel}
          </>
        ) : (
          <>
            <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            {watchedLabel}
          </>
        )}
      </button>
    </div>,
    document.body
  );
}
