import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { auth } from '../firebase';
import { searchAnimeKitsu } from '../api/kitsu';
import { searchContent, tmdbImage } from '../api/tmdb';

export default function CreateRoomModal({ onClose, defaultContent = null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(`${user.displayName}'s Room`);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedContent, setSelectedContent] = useState(defaultContent);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    const search = async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const [anime, movies, tv] = await Promise.all([
          searchAnimeKitsu(query).catch(() => []),
          searchContent(query, 'movie').catch(() => ({ results: [] })),
          searchContent(query, 'tv').catch(() => ({ results: [] }))
        ]);

        const combined = [
          ...anime.slice(0, 3).map(a => ({ contentId: String(a.id), contentType: 'anime', contentTitle: a.title.english || a.title.romaji, posterUrl: a.coverImage?.large })),
          ...(movies.results || []).slice(0, 3).map(m => ({ contentId: String(m.id), contentType: 'movie', contentTitle: m.title, posterUrl: tmdbImage(m.poster_path, 'w92') })),
          ...(tv.results || []).slice(0, 3).map(t => ({ contentId: String(t.id), contentType: 'tv', contentTitle: t.name, posterUrl: tmdbImage(t.poster_path, 'w92') }))
        ];
        setResults(combined);
      } catch (err) {
        console.error(err);
      }
      setIsSearching(false);
    };
    
    const debounce = setTimeout(search, 500);
    return () => clearTimeout(debounce);
  }, [query]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const token = await auth.currentUser.getIdToken();
      const body = { name };
      if (selectedContent) {
        body.contentId = selectedContent.contentId;
        body.contentType = selectedContent.contentType;
        body.contentTitle = selectedContent.contentTitle;
      }
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        let url;
        if (selectedContent?.contentType === 'anime') {
          // For anime: go to detail page so host can pick an episode
          url = `/anime/${selectedContent.contentId}?roomId=${data.id}&title=${encodeURIComponent(selectedContent.contentTitle)}`;
        } else if (selectedContent) {
          url = `/watch?roomId=${data.id}&type=${selectedContent.contentType}&tmdbId=${selectedContent.contentId}`;
        } else {
          url = `/watch?roomId=${data.id}`;
        }
        navigate(url);
      } else {
        const err = await res.json().catch(() => ({}));
        setSubmitError(err.error || 'Failed to create room. Please try again.');
      }
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="bg-surface-raised p-4 border-b border-border flex justify-between items-center shrink-0 rounded-t-2xl">
          <h3 className="font-bold text-primary text-xl">Start a Watch Party</h3>
          <button onClick={onClose} className="text-muted hover:text-primary transition-colors text-2xl leading-none">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto">
          <div className="mb-5">
             <label className="block text-sm font-bold text-primary mb-2">Room Name</label>
             <input type="text" required value={name} onChange={e => setName(e.target.value)}
               className="w-full bg-page border border-border rounded-lg p-3 text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue" />
          </div>
          
          <div className="mb-6">
             <label className="block text-sm font-bold text-primary mb-2">Select Content <span className="text-muted font-normal">(Optional)</span></label>
             
             {selectedContent ? (
               <div className="flex items-center gap-4 bg-surface-raised border border-border rounded-lg p-3">
                 <img src={selectedContent.posterUrl || '/placeholder.png'} className="w-12 h-16 object-cover rounded shadow-sm bg-page" alt="" />
                 <div className="flex-1">
                   <p className="font-bold text-primary line-clamp-1">{selectedContent.contentTitle}</p>
                   <span className="text-xs bg-page border border-border uppercase font-semibold text-secondary px-2 py-0.5 rounded shadow-sm">{selectedContent.contentType}</span>
                 </div>
                 <button type="button" onClick={() => setSelectedContent(null)} className="text-muted hover:text-red-500 font-bold px-2 py-1 bg-surface rounded border border-border shadow-sm transition-colors">Change</button>
               </div>
             ) : (
               <div className="relative">
                 <input type="text" placeholder="Search anime, movies, tv..." value={query} onChange={e => setQuery(e.target.value)}
                   className="w-full bg-page border border-border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-accent-blue shadow-sm" />
                 
                 {query && (
                   <div className="absolute top-full mt-2 left-0 right-0 bg-surface border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto z-10 divide-y divide-border-subtle">
                     {isSearching ? (
                       <p className="text-center p-4 text-muted font-medium">Searching...</p>
                     ) : results.length > 0 ? (
                       results.map((r, i) => (
                         <div key={`${r.contentType}-${r.contentId}-${i}`} onClick={() => { setSelectedContent(r); setQuery(''); }}
                           className="flex items-center gap-3 p-3 hover:bg-page cursor-pointer transition-colors">
                           <img src={r.posterUrl || '/placeholder.png'} className="w-10 h-14 object-cover rounded bg-page border border-border-subtle" alt="" />
                           <div className="flex-1">
                             <p className="font-bold text-primary text-sm line-clamp-1">{r.contentTitle}</p>
                             <span className="text-[10px] font-bold uppercase text-secondary tracking-wider">{r.contentType}</span>
                           </div>
                         </div>
                       ))
                     ) : (
                       <p className="text-center p-4 text-muted font-medium">No results found.</p>
                     )}
                   </div>
                 )}
               </div>
             )}
          </div>
          
          {submitError && (
            <p className="text-red-500 text-sm font-bold mb-3 bg-red-50 p-2 rounded text-center border border-red-200">{submitError}</p>
          )}
          <div className="mt-4 pt-6 border-t border-border flex justify-end gap-3 shrink-0">
             <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-lg font-bold text-secondary bg-surface hover:bg-page border border-border transition-colors">Cancel</button>
             <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 rounded-lg font-bold text-white bg-accent-blue hover:bg-red-700 shadow-md transition-transform hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed">
               {isSubmitting ? 'Creating...' : 'Create Room'}
             </button>
          </div>
        </form>
      </div>
    </div>
  );
}
