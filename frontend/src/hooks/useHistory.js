import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore';

export function useHistory(uid) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setHistory([]);
      setLoading(false);
      return;
    }
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
        setHistory(items);
      } catch (e) {
        console.error("History fetch error:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [uid]);

  return { history, setHistory, loading };
}
