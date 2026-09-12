import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore';
import { mergeLocalProgress } from '../utils/playerPreferences';

export function useHistory(uid) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setHistory([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const fetchHistory = async () => {
      // History is stored in users/{uid}/history/{contentId} subcollection
      const q = query(
        collection(db, 'users', uid, 'history'),
        orderBy('updatedAt', 'desc'),
        limit(40)
      );
      try {
        const snap = await getDocs(q);
        const items = [];
        snap.forEach(d => items.push({ id: d.id, ...d.data() }));
        if (!cancelled) setHistory(mergeLocalProgress(uid, items));
      } catch (e) {
        console.error("History fetch error:", e);
        if (!cancelled) setHistory(mergeLocalProgress(uid, []));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchHistory();
    return () => { cancelled = true; };
  }, [uid]);

  return { history, setHistory, loading };
}
