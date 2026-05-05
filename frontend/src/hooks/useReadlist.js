import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

export function useReadlist(uid) {
  const [readlist, setReadlist] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setReadlist([]);
      setLoading(false);
      return;
    }
    const fetchReadlist = async () => {
      const q = query(collection(db, 'readlist'), where('uid', '==', uid));
      const snap = await getDocs(q);
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      setReadlist(items);
      setLoading(false);
    };
    fetchReadlist();
  }, [uid]);

  const isInReadlist = (contentId) => readlist.some(item => item.contentId === String(contentId));

  const toggleReadlist = async (item) => {
    if (!uid) return;
    const existing = readlist.find(i => i.contentId === String(item.contentId));
    const docId = `${uid}_${item.contentId}`;
    const ref = doc(db, 'readlist', docId);

    if (existing) {
      await deleteDoc(ref);
      setReadlist(prev => prev.filter(i => i.contentId !== String(item.contentId)));
    } else {
      const newItem = {
        ...item,
        contentId: String(item.contentId),
        uid,
        addedAt: serverTimestamp(),
      };
      await setDoc(ref, newItem);
      setReadlist(prev => [...prev, { ...newItem, id: docId, addedAt: new Date() }]);
    }
  };

  return { readlist, loading, isInReadlist, toggleReadlist };
}
