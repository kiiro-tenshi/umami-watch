import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

export function useWatchlist(uid) {
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setWatchlist([]);
      setLoading(false);
      return;
    }
    const fetchWatchlist = async () => {
      const q = query(collection(db, 'watchlist'), where('uid', '==', uid));
      const snap = await getDocs(q);
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      setWatchlist(items);
      setLoading(false);
    };
    fetchWatchlist();
  }, [uid]);

  const isInWatchlist = (contentId) => watchlist.some(item => item.contentId === String(contentId));

  const toggleWatchlist = async (item) => {
    // item = { contentId, contentType, title, posterUrl }
    if (!uid) return;
    const existing = watchlist.find(i => i.contentId === String(item.contentId));
    
    // We use a compounded doc ID for uniqueness per user/content combo
    const docId = `${uid}_${item.contentId}`;
    const ref = doc(db, 'watchlist', docId);

    if (existing) {
      await deleteDoc(ref);
      setWatchlist(prev => prev.filter(i => i.contentId !== String(item.contentId)));
    } else {
      const newItem = {
        ...item,
        contentId: String(item.contentId),
        uid,
        addedAt: serverTimestamp()
      };
      await setDoc(ref, newItem);
      // Optimistic update
      setWatchlist(prev => [...prev, { ...newItem, id: docId, addedAt: new Date() }]);
    }
  };

  return { watchlist, loading, isInWatchlist, toggleWatchlist };
}
