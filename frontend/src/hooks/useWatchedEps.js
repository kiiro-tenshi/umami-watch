import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { getAnimeHistoryKey, normalizeAnimeSource } from '../utils/animeRouting';

function isWatched(data) {
  if (data.manuallyWatched === false) return false;
  if (data.manuallyWatched === true) return true;
  return !!(data.position && data.duration && data.position >= data.duration * 0.85);
}

const BATCH_LIMIT = 499;

export function useWatchedEps(kitsuId, user, animeTitle, posterUrl, animeSource = 'kitsu') {
  const [watchedEps, setWatchedEps] = useState(new Set());
  const normalizedSource = normalizeAnimeSource(animeSource);

  useEffect(() => {
    if (!user || !kitsuId) return;
    getDocs(query(
      collection(db, 'users', user.uid, 'history'),
      where('contentId', '==', kitsuId)
    )).then(snap => {
      const watched = new Set();
      snap.forEach(d => {
        const data = d.data();
        if (normalizeAnimeSource(data.contentSource) === normalizedSource && data.epNum && isWatched(data)) watched.add(data.epNum);
      });
      setWatchedEps(watched);
    }).catch(() => {});
  }, [user, kitsuId, normalizedSource]);

  const updateWatched = useCallback((epNum, watched) => {
    setWatchedEps(prev => {
      if (watched) return prev.has(epNum) ? prev : new Set([...prev, epNum]);
      const next = new Set(prev);
      next.delete(epNum);
      return next;
    });
  }, []);

  const toggleWatched = useCallback(async (epNum) => {
    if (!user || !kitsuId) return;
    const isCurrentlyWatched = watchedEps.has(epNum);
    const ref = doc(db, 'users', user.uid, 'history', getAnimeHistoryKey(kitsuId, epNum, normalizedSource));
    if (isCurrentlyWatched) {
      setWatchedEps(prev => { const next = new Set(prev); next.delete(epNum); return next; });
      await setDoc(ref, { manuallyWatched: false, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      setWatchedEps(prev => new Set([...prev, epNum]));
      await setDoc(ref, {
        contentId: kitsuId,
        contentType: 'anime',
        contentSource: normalizedSource,
        epNum,
        title: animeTitle || '',
        posterUrl: posterUrl || '',
        manuallyWatched: true,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
  }, [user, kitsuId, normalizedSource, watchedEps, animeTitle, posterUrl]);

  const markAllWatched = useCallback(async (episodes) => {
    if (!user || !kitsuId || !episodes?.length) return;
    for (let i = 0; i < episodes.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      episodes.slice(i, i + BATCH_LIMIT).forEach(ep => {
        const ref = doc(db, 'users', user.uid, 'history', getAnimeHistoryKey(kitsuId, ep.number, normalizedSource));
        batch.set(ref, {
          contentId: kitsuId,
          contentType: 'anime',
          contentSource: normalizedSource,
          epNum: ep.number,
          title: animeTitle || '',
          posterUrl: posterUrl || '',
          manuallyWatched: true,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();
    }
    setWatchedEps(new Set(episodes.map(ep => ep.number)));
  }, [user, kitsuId, normalizedSource, animeTitle, posterUrl]);

  const markAllUnwatched = useCallback(async () => {
    if (!user || !kitsuId) return;
    const snap = await getDocs(query(
      collection(db, 'users', user.uid, 'history'),
      where('contentId', '==', kitsuId)
    ));
    const sourceDocs = snap.docs.filter(d => normalizeAnimeSource(d.data().contentSource) === normalizedSource);
    if (sourceDocs.length === 0) { setWatchedEps(new Set()); return; }
    for (let i = 0; i < sourceDocs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      sourceDocs.slice(i, i + BATCH_LIMIT).forEach(d =>
        batch.update(d.ref, { manuallyWatched: false, updatedAt: serverTimestamp() })
      );
      await batch.commit();
    }
    setWatchedEps(new Set());
  }, [user, kitsuId, normalizedSource]);

  return { watchedEps, toggleWatched, markAllWatched, markAllUnwatched, updateWatched };
}
