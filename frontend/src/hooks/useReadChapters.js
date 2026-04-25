import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

const BATCH_LIMIT = 499;

export function useReadChapters(mangaId, user) {
  const [readSet, setReadSet] = useState(new Set());     // chapterNums explicitly marked read
  const [unreadSet, setUnreadSet] = useState(new Set()); // chapterNums explicitly marked unread

  useEffect(() => {
    if (!user || !mangaId) return;
    getDocs(query(
      collection(db, 'users', user.uid, 'history'),
      where('contentId', '==', mangaId),
      where('contentType', '==', 'manga-chapter')
    )).then(snap => {
      const read = new Set();
      const unread = new Set();
      snap.forEach(d => {
        const { chapterNum, manuallyRead } = d.data();
        if (!chapterNum) return;
        if (manuallyRead === true) read.add(String(chapterNum));
        else if (manuallyRead === false) unread.add(String(chapterNum));
      });
      setReadSet(read);
      setUnreadSet(unread);
    }).catch(() => {});
  }, [user, mangaId]);

  // Returns whether a chapter is considered read (combines manual + auto positional detection)
  const isChapterRead = useCallback((chapterNum, lastReadNum) => {
    const key = String(chapterNum);
    if (unreadSet.has(key)) return false;
    if (readSet.has(key)) return true;
    const n = parseFloat(chapterNum);
    return lastReadNum != null && !isNaN(n) && n < lastReadNum;
  }, [readSet, unreadSet]);

  const toggleRead = useCallback(async (chapterNum, currentIsRead) => {
    if (!user || !mangaId) return;
    const key = String(chapterNum);
    const ref = doc(db, 'users', user.uid, 'history', `manga_${mangaId}_ch_${key}`);
    if (currentIsRead) {
      setReadSet(prev => { const next = new Set(prev); next.delete(key); return next; });
      setUnreadSet(prev => new Set([...prev, key]));
      await setDoc(ref, { contentId: mangaId, contentType: 'manga-chapter', chapterNum: key, manuallyRead: false, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      setUnreadSet(prev => { const next = new Set(prev); next.delete(key); return next; });
      setReadSet(prev => new Set([...prev, key]));
      await setDoc(ref, { contentId: mangaId, contentType: 'manga-chapter', chapterNum: key, manuallyRead: true, updatedAt: serverTimestamp() }, { merge: true });
    }
  }, [user, mangaId]);

  const markAllRead = useCallback(async (chapters) => {
    if (!user || !mangaId || !chapters?.length) return;
    const allNums = chapters.map(ch => String(ch.attributes?.chapter)).filter(Boolean);
    for (let i = 0; i < allNums.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      allNums.slice(i, i + BATCH_LIMIT).forEach(key => {
        const ref = doc(db, 'users', user.uid, 'history', `manga_${mangaId}_ch_${key}`);
        batch.set(ref, { contentId: mangaId, contentType: 'manga-chapter', chapterNum: key, manuallyRead: true, updatedAt: serverTimestamp() }, { merge: true });
      });
      await batch.commit();
    }
    setReadSet(new Set(allNums));
    setUnreadSet(new Set());
  }, [user, mangaId]);

  const markAllUnread = useCallback(async () => {
    if (!user || !mangaId) return;
    const snap = await getDocs(query(
      collection(db, 'users', user.uid, 'history'),
      where('contentId', '==', mangaId),
      where('contentType', '==', 'manga-chapter')
    ));
    if (!snap.empty) {
      for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + BATCH_LIMIT).forEach(d =>
          batch.update(d.ref, { manuallyRead: false, updatedAt: serverTimestamp() })
        );
        await batch.commit();
      }
    }
    setReadSet(new Set());
    setUnreadSet(new Set());
  }, [user, mangaId]);

  const markChapterRead = useCallback(async (chapterNum) => {
    if (!user || !mangaId) return;
    const key = String(chapterNum);
    const ref = doc(db, 'users', user.uid, 'history', `manga_${mangaId}_ch_${key}`);
    await setDoc(ref, { contentId: mangaId, contentType: 'manga-chapter', chapterNum: key, manuallyRead: true, updatedAt: serverTimestamp() }, { merge: true });
    setReadSet(prev => prev.has(key) ? prev : new Set([...prev, key]));
    setUnreadSet(prev => { const next = new Set(prev); next.delete(key); return next; });
  }, [user, mangaId]);

  return { isChapterRead, toggleRead, markAllRead, markAllUnread, markChapterRead };
}
