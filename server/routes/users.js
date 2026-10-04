import express from 'express';
import requireAuth from '../middleware/requireAuth.js';
import admin from 'firebase-admin';
import { validateStickerLibrary, saveStickerLibrary } from '../utils/stickerLibrary.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const doc = await admin.firestore().collection('users').doc(req.user.uid).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(doc.data());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sticker-pool', async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection('shared_sticker_packs').get();
    const packs = snapshot.docs.flatMap(doc => {
      const { name, title, sharedBy } = doc.data();
      return Array.isArray(sharedBy) && sharedBy.length ? [{ name, title }] : [];
    });
    packs.sort((a, b) => a.title.localeCompare(b.title));
    res.json({ packs });
  } catch {
    res.status(500).json({ error: 'Could not load shared sticker packs.' });
  }
});

router.patch('/', async (req, res) => {
  try {
    const { displayName, photoURL, rdApiKey, telegramStickerPacks } = req.body;
    const updates = {};
    if (telegramStickerPacks !== undefined) {
      if (!validateStickerLibrary(telegramStickerPacks)) {
        return res.status(400).json({ error: 'Invalid sticker library. Use up to 30 unique packs with a name, title and enabled/share settings.' });
      }
      updates.telegramStickerPacks = telegramStickerPacks.map(({ name, title, enabled, shared }) => ({ name, title, enabled, shared: shared === true }));
    }
    if (displayName !== undefined) updates.displayName = displayName;
    if (photoURL !== undefined) updates.photoURL = photoURL;
    if (rdApiKey !== undefined) updates.rdApiKey = rdApiKey;

    if (telegramStickerPacks !== undefined) {
      await saveStickerLibrary(admin.firestore(), req.user.uid, updates);
    } else {
      await admin.firestore().collection('users').doc(req.user.uid).update(updates);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete all watch history for the current user
router.delete('/history', async (req, res) => {
  try {
    const histRef = admin.firestore().collection('users').doc(req.user.uid).collection('history');
    const snap = await histRef.get();
    const batch = admin.firestore().batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    res.json({ success: true, deleted: snap.size });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
