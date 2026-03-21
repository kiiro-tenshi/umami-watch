import express from 'express';
import requireAuth from '../middleware/requireAuth.js';
import admin from 'firebase-admin';

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

router.patch('/', async (req, res) => {
  try {
    const { displayName, photoURL, rdApiKey } = req.body;
    const updates = {};
    if (displayName !== undefined) updates.displayName = displayName;
    if (photoURL !== undefined) updates.photoURL = photoURL;
    if (rdApiKey !== undefined) updates.rdApiKey = rdApiKey;

    await admin.firestore().collection('users').doc(req.user.uid).update(updates);
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
