import { describe, expect, it, vi } from 'vitest';
import { saveStickerLibrary, validateStickerLibrary } from '../utils/stickerLibrary.js';

const CAT = { name: 'CatPack', title: 'Cats', enabled: true, shared: false };
function memoryDb() {
  const records = new Map([['users/alice', {}], ['users/bob', {}]]);
  return {
    records,
    collection: name => ({ doc: id => `${name}/${id}` }),
    runTransaction: vi.fn(async callback => {
      const writes = [];
      let writing = false;
      const transaction = {
        get: async ref => {
          if (writing) throw new Error('Read after write');
          return { data: () => records.get(ref) };
        },
        set: (ref, data) => { writing = true; writes.push(() => records.set(ref, data)); },
        delete: ref => { writing = true; writes.push(() => records.delete(ref)); },
        update: (ref, data) => { writing = true; writes.push(() => records.set(ref, { ...records.get(ref), ...data })); },
      };
      await callback(transaction);
      writes.forEach(write => write());
    }),
  };
}
const save = (db, uid, packs) => saveStickerLibrary(db, uid, { telegramStickerPacks: packs });

describe('personal libraries and shared pool', () => {
  it('keeps private packs out of the pool and removes the pool entry only after the last contributor unshares', async () => {
    const db = memoryDb();
    await save(db, 'alice', [CAT]);
    expect(db.records.has('shared_sticker_packs/catpack')).toBe(false);
    await save(db, 'alice', [{ ...CAT, shared: true }]);
    await save(db, 'bob', [{ ...CAT, name: 'catpack', shared: true }]);
    expect(db.records.get('shared_sticker_packs/catpack').sharedBy).toEqual(['alice', 'bob']);
    await save(db, 'alice', []);
    expect(db.records.get('shared_sticker_packs/catpack').sharedBy).toEqual(['bob']);
    await save(db, 'bob', [{ ...CAT, shared: false }]);
    expect(db.records.has('shared_sticker_packs/catpack')).toBe(false);
    expect(db.records.get('users/bob').telegramStickerPacks).toEqual([CAT]);
  });

  it('changing chat visibility does not stop sharing and repeated saves do not duplicate contributions', async () => {
    const db = memoryDb();
    await save(db, 'alice', [{ ...CAT, shared: true }]);
    await save(db, 'alice', [{ ...CAT, shared: true, enabled: false }]);
    expect(db.records.get('shared_sticker_packs/catpack').sharedBy).toEqual(['alice']);
  });

  it("unsharing preserves another user's personal copy", async () => {
    const db = memoryDb();
    await save(db, 'alice', [{ ...CAT, shared: true }]);
    await save(db, 'bob', [CAT]);
    await save(db, 'alice', [CAT]);
    expect(db.records.has('shared_sticker_packs/catpack')).toBe(false);
    expect(db.records.get('users/bob').telegramStickerPacks).toEqual([CAT]);
  });

  it('validates empty libraries and rejects duplicate, oversized or malformed preferences', () => {
    expect(validateStickerLibrary([])).toBe(true);
    expect(validateStickerLibrary([CAT])).toBe(true);
    for (const invalid of [null, [CAT, { ...CAT, name: 'catpack' }], Array(31).fill(CAT),
      [{ ...CAT, name: '../path' }], [{ ...CAT, enabled: 'yes' }], [{ ...CAT, shared: 'yes' }],
      [{ ...CAT, title: '' }], [{ ...CAT, title: 'x'.repeat(129) }]]) {
      expect(validateStickerLibrary(invalid)).toBe(false);
    }
  });
});
