export const STICKER_PACK_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export function validateStickerLibrary(packs) {
  if (!Array.isArray(packs) || packs.length > 30) return false;
  const names = new Set();
  for (const pack of packs) {
    if (!pack || typeof pack.name !== 'string' || !STICKER_PACK_NAME.test(pack.name)
      || typeof pack.title !== 'string' || !pack.title.trim() || pack.title.length > 128
      || typeof pack.enabled !== 'boolean' || (pack.shared !== undefined && typeof pack.shared !== 'boolean')
      || names.has(pack.name.toLowerCase())) return false;
    names.add(pack.name.toLowerCase());
  }
  return true;
}

// Keep each user's library and their contributions to the shared pool atomic.
// Another user's contribution keeps a pack in the pool after one user unshares it.
export async function saveStickerLibrary(db, uid, updates) {
  const userRef = db.collection('users').doc(uid);
  const next = updates.telegramStickerPacks;
  await db.runTransaction(async transaction => {
    const profile = await transaction.get(userRef);
    const previous = profile.data()?.telegramStickerPacks || [];
    const contributions = new Map();
    for (const pack of previous) {
      if (pack.shared) contributions.set(pack.name.toLowerCase(), { pack, shared: false });
    }
    for (const pack of next) {
      if (pack.shared) contributions.set(pack.name.toLowerCase(), { pack, shared: true });
    }
    // Firestore requires all reads to complete before transaction writes.
    const records = await Promise.all([...contributions].map(async ([key, value]) => {
      const ref = db.collection('shared_sticker_packs').doc(key);
      const snap = await transaction.get(ref);
      return { ...value, ref, data: snap.data() };
    }));
    for (const { pack, shared, ref, data } of records) {
      const sharedBy = new Set(data?.sharedBy || []);
      if (shared) sharedBy.add(uid);
      else sharedBy.delete(uid);
      if (sharedBy.size) {
        transaction.set(ref, {
          name: data?.name || pack.name,
          title: data?.title || pack.title,
          sharedBy: [...sharedBy],
        });
      } else {
        transaction.delete(ref);
      }
    }
    transaction.update(userRef, updates);
  });
}
