import { useState, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useWatchlist } from '../hooks/useWatchlist';
import { useReadlist } from '../hooks/useReadlist';
import { useHistory } from '../hooks/useHistory';
import ContentCard from '../components/ContentCard';
import { auth } from '../firebase';

function resizeImage(file, maxSize) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

export default function ProfilePage() {
  const { user, updateUserProfile } = useAuth();
  const { watchlist, toggleWatchlist } = useWatchlist(user?.uid);
  const { readlist, toggleReadlist } = useReadlist(user?.uid);
  const { history, setHistory } = useHistory(user?.uid);
  const [tab, setTab] = useState('settings');

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const fileInputRef = useRef(null);

  const [clearingHistory, setClearingHistory] = useState(false);

  const handleLogout = async () => {
    try { await signOut(auth); } catch (e) { alert('Failed to log out'); }
  };

  const handleSaveName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed || trimmed === user?.displayName) return;
    setSavingName(true);
    try {
      await updateUserProfile({ displayName: trimmed });
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2500);
    } catch (e) {
      alert('Failed to update display name.');
    } finally {
      setSavingName(false);
    }
  };

  const handleAvatarClick = () => {
    setAvatarError('');
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setAvatarError('Please select an image file.'); return; }
    if (file.size > 10 * 1024 * 1024) { setAvatarError('Image must be under 10 MB.'); return; }

    setUploadingAvatar(true);
    setAvatarError('');
    try {
      const dataUrl = await resizeImage(file, 128);
      await updateUserProfile({ photoURL: dataUrl });
    } catch (err) {
      setAvatarError('Failed to process image.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm('Clear all watch history? This cannot be undone.')) return;
    setClearingHistory(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/me/history`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Server error');
      setHistory([]);
    } catch (e) {
      alert('Failed to clear history.');
    } finally {
      setClearingHistory(false);
    }
  };

  const avatarUrl = user?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user?.displayName}`;

  // Filter watchlist: anime/movies/TV only (manga is in readlist now)
  const videoWatchlist = watchlist.filter(item => item.contentType !== 'manga');

  // Split history into watch (video) and read (manga)
  const watchHistory = history.filter(h => ['anime', 'movie', 'tv'].includes(h.contentType));
  const readHistory = history.filter(h => h.contentType === 'manga');

  const tabClass = (t, activeColor) =>
    `flex-1 md:flex-none p-3 md:p-4 text-center md:text-left transition-colors whitespace-nowrap font-semibold ${
      tab === t
        ? `bg-surface-raised ${activeColor} md:border-l-4 border-b-2 md:border-b-0`
        : 'text-secondary hover:bg-page md:border-l-4 md:border-l-transparent'
    }`;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto flex flex-col md:flex-row gap-8">
      {/* Sidebar */}
      <div className="w-full md:w-64 shrink-0 flex flex-col gap-6">
        <div className="bg-surface rounded-2xl p-6 shadow-md border border-border flex flex-col items-center">
          <div className="relative mb-4 group cursor-pointer" onClick={handleAvatarClick}>
            {uploadingAvatar ? (
              <div className="w-24 h-24 rounded-full border-4 border-surface-raised bg-page flex items-center justify-center">
                <div className="w-7 h-7 border-4 border-accent-teal/30 border-t-accent-teal rounded-full animate-spin" />
              </div>
            ) : (
              <img
                src={avatarUrl}
                className="w-24 h-24 rounded-full border-4 border-surface-raised shadow-lg object-cover bg-page transition-opacity group-hover:opacity-70"
                alt="Avatar"
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-white text-xs font-bold bg-black/60 rounded-full px-2 py-1">Change</span>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          {avatarError && <p className="text-red-500 text-xs text-center mb-2">{avatarError}</p>}
          <h2 className="text-xl font-bold text-primary text-center">{user?.displayName}</h2>
          <p className="text-secondary text-sm text-center truncate w-full mb-4 font-medium">{user?.email}</p>
        </div>

        <div className="bg-surface rounded-xl shadow-sm border border-border overflow-hidden font-semibold">
          <div className="flex md:flex-col divide-x md:divide-x-0 md:divide-y divide-border-subtle overflow-x-auto scrollbar-hide">
            <button onClick={() => setTab('settings')} className={tabClass('settings', 'text-accent-blue md:border-l-accent-blue border-b-accent-blue')}>
              Settings
            </button>
            <button onClick={() => setTab('watchlist')} className={`${tabClass('watchlist', 'text-accent-red md:border-l-red-500 border-b-red-500')} flex justify-center md:justify-between items-center gap-1`}>
              Watchlist
              <span className="bg-accent-red text-white text-xs px-1.5 py-0.5 rounded-full">{videoWatchlist.length}</span>
            </button>
            <button onClick={() => setTab('readlist')} className={`${tabClass('readlist', 'text-accent-purple md:border-l-accent-purple border-b-accent-purple')} flex justify-center md:justify-between items-center gap-1`}>
              Readlist
              <span className="bg-accent-purple text-white text-xs px-1.5 py-0.5 rounded-full">{readlist.length}</span>
            </button>
            <button onClick={() => setTab('history')} className={tabClass('history', 'text-accent-orange md:border-l-accent-orange border-b-accent-orange')}>
              History
            </button>
            <button onClick={handleLogout} className="flex-1 md:flex-none p-3 md:p-4 text-center md:text-left transition-colors text-secondary hover:bg-page whitespace-nowrap md:border-l-4 md:border-l-transparent">
              Log Out
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-surface rounded-2xl p-6 md:p-8 shadow-md border border-border">

        {tab === 'settings' && (
          <div className="space-y-8 animate-in fade-in">
            <div>
              <h1 className="text-3xl font-bold text-primary mb-2">Settings</h1>
              <p className="text-secondary font-medium border-b border-border pb-6">Manage your account preferences.</p>
            </div>

            <div className="bg-surface rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="p-6 bg-surface-raised border-b border-border">
                <h2 className="text-xl font-bold text-primary flex items-center gap-2 mb-1">
                  <span>👤</span> Profile
                </h2>
                <p className="text-secondary text-sm font-medium">Update your display name and profile picture.</p>
              </div>
              <div className="p-6 space-y-5">
                <div className="flex items-center gap-5">
                  <div className="relative group cursor-pointer flex-shrink-0" onClick={handleAvatarClick}>
                    {uploadingAvatar ? (
                      <div className="w-16 h-16 rounded-full bg-surface-raised border border-border flex items-center justify-center">
                        <div className="w-5 h-5 border-4 border-accent-teal/30 border-t-accent-teal rounded-full animate-spin" />
                      </div>
                    ) : (
                      <img src={avatarUrl} className="w-16 h-16 rounded-full object-cover border border-border group-hover:opacity-70 transition-opacity" alt="" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <span className="text-white text-xs font-bold bg-black/60 rounded-full px-1.5 py-0.5">Edit</span>
                    </div>
                  </div>
                  <div>
                    <button onClick={handleAvatarClick} className="text-sm font-semibold text-accent-blue hover:underline">
                      Upload new picture
                    </button>
                    <p className="text-xs text-muted mt-0.5">JPG, PNG or GIF · max 5 MB</p>
                    {avatarError && <p className="text-red-500 text-xs mt-1">{avatarError}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-secondary mb-1.5">Display name</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={displayName}
                      onChange={e => { setDisplayName(e.target.value); setNameSaved(false); }}
                      onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                      className="flex-1 bg-page border border-border rounded-lg px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent-teal/40"
                      placeholder="Your name"
                      maxLength={50}
                    />
                    <button
                      onClick={handleSaveName}
                      disabled={savingName || !displayName.trim() || displayName.trim() === user?.displayName}
                      className="px-4 py-2 rounded-lg text-sm font-bold transition-colors bg-accent-teal text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                    >
                      {savingName ? 'Saving…' : nameSaved ? 'Saved ✓' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="p-6 bg-surface-raised border-b border-border">
                <h2 className="text-xl font-bold text-primary flex items-center gap-2 mb-1">
                  <span>⚙️</span> Account
                </h2>
                <p className="text-secondary text-sm font-medium">Manage your session.</p>
              </div>
              <div className="p-6">
                <button onClick={handleLogout} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-md transition-colors">
                  Log Out
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'watchlist' && (
          <div className="animate-in fade-in">
            <h1 className="text-3xl font-bold text-primary mb-6 pb-4 border-b border-border flex items-center justify-between">
              Watchlist
              <span className="text-sm font-semibold bg-surface-raised border border-border text-muted px-3 py-1 rounded-full">{videoWatchlist.length} items</span>
            </h1>
            {videoWatchlist.length === 0 ? (
              <div className="text-center py-20 text-muted font-medium bg-page rounded-xl border border-dashed border-border">No anime, movies, or TV shows in your watchlist yet.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {videoWatchlist.map(item => (
                  <div key={item.contentId} className="relative group/card">
                    <ContentCard id={item.contentId} title={item.title} posterUrl={item.posterUrl} contentType={item.contentType} className="w-full h-48 sm:h-60" />
                    <button
                      onClick={() => toggleWatchlist({ contentId: item.contentId, contentType: item.contentType, title: item.title, posterUrl: item.posterUrl })}
                      title="Remove from watchlist"
                      className="absolute top-1.5 right-1.5 z-10 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'readlist' && (
          <div className="animate-in fade-in">
            <h1 className="text-3xl font-bold text-primary mb-6 pb-4 border-b border-border flex items-center justify-between">
              Readlist
              <span className="text-sm font-semibold bg-surface-raised border border-border text-muted px-3 py-1 rounded-full">{readlist.length} manga</span>
            </h1>
            {readlist.length === 0 ? (
              <div className="text-center py-20 text-muted font-medium bg-page rounded-xl border border-dashed border-border">No manga in your readlist yet.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {readlist.map(item => (
                  <div key={item.contentId} className="relative group/card">
                    <ContentCard id={item.contentId} title={item.title} posterUrl={item.posterUrl} contentType="manga" className="w-full h-48 sm:h-60" />
                    <button
                      onClick={() => toggleReadlist({ contentId: item.contentId, contentType: 'manga', title: item.title, posterUrl: item.posterUrl })}
                      title="Remove from readlist"
                      className="absolute top-1.5 right-1.5 z-10 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="animate-in fade-in">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
              <h1 className="text-3xl font-bold text-primary">History</h1>
              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  disabled={clearingHistory}
                  className="text-sm font-semibold text-red-500 hover:text-red-400 border border-red-300 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {clearingHistory ? 'Clearing…' : 'Clear All'}
                </button>
              )}
            </div>

            {/* Watch History */}
            <div className="mb-8">
              <h2 className="text-lg font-bold text-secondary mb-4 flex items-center gap-2">
                <span className="w-1 h-5 bg-accent-blue rounded-full inline-block" />
                Watch History
              </h2>
              {watchHistory.length === 0 ? (
                <div className="text-center py-10 text-muted font-medium bg-page rounded-xl border border-dashed border-border">No watch history yet.</div>
              ) : (
                <div className="space-y-3">
                  {watchHistory.map(item => {
                    const progress = item.duration > 0 ? (item.position / item.duration) * 100 : 0;
                    return (
                      <div key={item.id} className="flex gap-4 p-4 rounded-xl hover:bg-surface-raised transition-colors border border-transparent hover:border-border group bg-page shadow-sm">
                        <img src={item.posterUrl} className="w-16 h-24 object-cover rounded shadow-sm border border-border shrink-0" alt="" />
                        <div className="flex-1 flex flex-col justify-center min-w-0">
                          <div className="flex justify-between items-start mb-1 gap-2">
                            <h3 className="font-bold text-primary text-base group-hover:text-accent-blue transition-colors line-clamp-1">{item.title}</h3>
                            <span className="text-xs uppercase bg-surface border border-border text-secondary font-bold px-2 py-0.5 rounded shadow-sm shrink-0">{item.contentType}</span>
                          </div>
                          <p className="text-sm text-secondary font-semibold mb-3">
                            {item.epNum && `Ep ${item.epNum} · `}
                            {item.seasonNum && `S${item.seasonNum} `}{item.episodeNum && `E${item.episodeNum}`}
                            {(item.seasonNum || item.episodeNum || item.epNum) && ' · '}
                            Stopped at {Math.floor(item.position / 60)}:{String(Math.floor(item.position % 60)).padStart(2, '0')}
                          </p>
                          <div className="w-full max-w-sm h-1.5 bg-border-subtle rounded-full overflow-hidden shadow-inner">
                            <div className="bg-accent-blue h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, progress)}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Read History */}
            <div>
              <h2 className="text-lg font-bold text-secondary mb-4 flex items-center gap-2">
                <span className="w-1 h-5 bg-accent-purple rounded-full inline-block" />
                Read History
              </h2>
              {readHistory.length === 0 ? (
                <div className="text-center py-10 text-muted font-medium bg-page rounded-xl border border-dashed border-border">No manga read history yet.</div>
              ) : (
                <div className="space-y-3">
                  {readHistory.map(item => (
                    <Link
                      key={item.id}
                      to={item.chapterId ? `/manga/${item.contentId}/chapter/${item.chapterId}?page=${item.pageNum || 1}` : `/manga/${item.contentId}`}
                      className="flex gap-4 p-4 rounded-xl hover:bg-surface-raised transition-colors border border-transparent hover:border-border group bg-page shadow-sm"
                    >
                      <img src={item.posterUrl} className="w-16 h-24 object-cover rounded shadow-sm border border-border shrink-0" alt="" />
                      <div className="flex-1 flex flex-col justify-center min-w-0">
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <h3 className="font-bold text-primary text-base group-hover:text-accent-purple transition-colors line-clamp-1">{item.title}</h3>
                          <span className="text-xs uppercase bg-surface border border-border text-secondary font-bold px-2 py-0.5 rounded shadow-sm shrink-0">manga</span>
                        </div>
                        {item.chapterNum && (
                          <p className="text-sm text-secondary font-semibold">
                            Ch. {item.chapterNum}
                            {item.pageNum ? <span className="text-muted font-normal"> · p.{item.pageNum}</span> : null}
                          </p>
                        )}
                        <p className="text-xs text-accent-purple mt-1 font-medium">Continue reading →</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
