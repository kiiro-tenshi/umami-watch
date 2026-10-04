import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getTelegramStickerPack } from '../api/telegramStickers';
import { getSharedStickerPacks } from '../api/stickerPool';
import { getUserStickerPacks, MAX_STICKER_PACKS, parseTelegramStickerUrl } from '../utils/stickerLibrary';

export default function StickerLibrarySettings() {
  const { user, updateUserProfile } = useAuth();
  const packs = getUserStickerPacks(user);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [pool, setPool] = useState([]);
  const [poolError, setPoolError] = useState('');
  const [loadingPool, setLoadingPool] = useState(true);
  const [poolRefresh, setPoolRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadingPool(true);
    setPoolError('');
    getSharedStickerPacks()
      .then(packs => { if (!cancelled) setPool(packs); })
      .catch(err => { if (!cancelled) setPoolError(err.message); })
      .finally(() => { if (!cancelled) setLoadingPool(false); });
    return () => { cancelled = true; };
  }, [user?.uid, poolRefresh]);

  const save = async (next, message) => {
    await updateUserProfile({ telegramStickerPacks: next });
    setStatus(message);
    setPoolRefresh(value => value + 1);
  };

  const addByName = async (name) => {
    if (packs.some(pack => pack.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('This sticker pack is already in your library.');
    }
    if (packs.length >= MAX_STICKER_PACKS) throw new Error(`You can save up to ${MAX_STICKER_PACKS} packs. Remove a pack first.`);
    const pack = await getTelegramStickerPack(name);
    if (!pack.stickers?.length) throw new Error('This pack has no supported stickers.');
    await save([...packs, { name, title: (pack.title || name).slice(0, 128), enabled: true, shared: false }], 'Sticker pack added.');
  };

  const addPack = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    setStatus('');
    setBusy(true);
    try {
      await addByName(parseTelegramStickerUrl(url));
      setUrl('');
    } catch (err) {
      setError(err.message || 'Could not add this sticker pack.');
    } finally {
      setBusy(false);
    }
  };

  const addFromPool = async (name) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    try { await addByName(name); }
    catch (err) { setError(err.message || 'Could not add this sticker pack.'); }
    finally { setBusy(false); }
  };

  const updatePack = async (next, message) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    try { await save(next, message); }
    catch (err) { setError(err.message || 'Could not save your sticker library.'); }
    finally { setBusy(false); }
  };

  return (
    <section className="bg-surface rounded-2xl shadow-sm border border-border overflow-hidden" aria-labelledby="sticker-library-title">
      <div className="p-6 bg-surface-raised border-b border-border">
        <h2 id="sticker-library-title" className="text-xl font-bold text-primary mb-1">Sticker library</h2>
        <p className="text-secondary text-sm font-medium">Add Telegram sticker packs and choose which ones appear in your watch-party chat.</p>
      </div>
      <div className="p-6 space-y-5">
        <form onSubmit={addPack} className="space-y-2">
          <label htmlFor="telegram-pack-url" className="block text-sm font-semibold text-secondary">Telegram sticker pack URL</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input id="telegram-pack-url" type="url" required value={url} onChange={event => setUrl(event.target.value)}
              placeholder="https://t.me/addstickers/PackName" maxLength={512} disabled={busy}
              className="flex-1 min-w-0 bg-page border border-border rounded-lg px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent-teal/40" />
            <button type="submit" disabled={busy || !url.trim()} className="px-4 py-2 rounded-lg text-sm font-bold bg-accent-teal text-white disabled:opacity-40 disabled:cursor-not-allowed">
              {busy ? 'Saving...' : 'Add pack'}
            </button>
          </div>
          <p className="text-xs text-muted">Changes save automatically to your account. {packs.length}/{MAX_STICKER_PACKS} packs.</p>
        </form>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        {status && <p role="status" className="text-sm text-accent-teal">{status}</p>}
        <p className="text-xs text-muted">Sharing makes a pack available for all users to add. Packs you add stay in your library if someone later stops sharing them.</p>
        {packs.length ? (
          <ul className="divide-y divide-border">
            {packs.map(pack => (
              <li key={pack.name} className="py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary break-words">{pack.title}</p>
                  <a href={`https://t.me/addstickers/${pack.name}`} target="_blank" rel="noreferrer" className="text-xs text-accent-blue hover:underline break-all">View on Telegram</a>
                </div>
                <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
                  <input type="checkbox" checked={pack.enabled !== false} disabled={busy}
                    aria-label={`Show ${pack.title} in chat`}
                    onChange={event => updatePack(packs.map(item => item.name === pack.name ? { ...item, enabled: event.target.checked } : item), 'Chat sticker selection saved.')} />
                  Show in chat
                </label>
                <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
                  <input type="checkbox" checked={pack.shared === true} disabled={busy}
                    aria-label={`Share ${pack.title} with everyone`}
                    onChange={event => updatePack(packs.map(item => item.name === pack.name ? { ...item, shared: event.target.checked } : item), event.target.checked ? 'Sticker pack shared with everyone.' : 'Sticker pack sharing turned off.')} />
                  Share with everyone
                </label>
                <button type="button" disabled={busy} aria-label={`Remove ${pack.title}`}
                  onClick={() => updatePack(packs.filter(item => item.name !== pack.name), 'Sticker pack removed.')}
                  className="text-sm text-red-500 hover:underline disabled:opacity-40">Remove</button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Your library is empty. Add a pack to use stickers in chat.</p>}
        <div className="border-t border-border pt-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-primary">Shared sticker pool</h3>
            <button type="button" onClick={() => setPoolRefresh(value => value + 1)} disabled={loadingPool || busy}
              className="text-sm text-accent-blue hover:underline disabled:opacity-40">Refresh shared packs</button>
          </div>
          <p className="text-sm text-secondary">Discover packs shared by other users and add them to your library.</p>
          {loadingPool ? <p className="text-sm text-muted">Loading shared packs...</p>
            : poolError ? <p role="alert" className="text-sm text-red-500">{poolError}</p>
            : pool.length ? (
              <ul className="divide-y divide-border">
                {pool.map(pack => {
                  const added = packs.some(item => item.name.toLowerCase() === pack.name.toLowerCase());
                  return (
                    <li key={pack.name} className="py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-primary break-words">{pack.title}</p>
                        <a href={`https://t.me/addstickers/${pack.name}`} target="_blank" rel="noreferrer" className="text-xs text-accent-blue hover:underline">View on Telegram</a>
                      </div>
                      <button type="button" disabled={busy || added || packs.length >= MAX_STICKER_PACKS}
                        aria-label={`Add ${pack.title} to library`} onClick={() => addFromPool(pack.name)}
                        className="px-3 py-2 rounded-lg text-sm font-bold bg-accent-teal text-white disabled:opacity-40">
                        {added ? 'In your library' : 'Add to library'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-muted">No packs shared yet. Turn on sharing for a pack in your library to add it here.</p>}
        </div>
      </div>
    </section>
  );
}
