import express from 'express';
import requireAuth from '../middleware/requireAuth.js';
import admin from 'firebase-admin';
import crypto from 'crypto';

const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function deleteExpiredRooms(io) {
  const now = admin.firestore.Timestamp.now();
  const sn = await admin.firestore().collection('rooms')
    .where('expiresAt', '<=', now).get();
  if (sn.empty) return;
  const batch = admin.firestore().batch();
  sn.docs.forEach(doc => {
    io.to(doc.id).emit('room:deleted');
    batch.delete(doc.ref);
  });
  await batch.commit();
}

export default function createRoomRouter(io) {
const router = express.Router();
router.use(requireAuth);

// Run cleanup every 10 minutes
const cleanupInterval = setInterval(() => deleteExpiredRooms(io).catch(console.error), 10 * 60 * 1000);
cleanupInterval.unref(); // don't keep process alive

router.get('/', async (req, res) => {
  try {
    const now = admin.firestore.Timestamp.now();
    const sn = await admin.firestore().collection('rooms').where('members', 'array-contains', req.user.uid).get();
    const rooms = sn.docs
      .filter(d => !d.data().expiresAt || d.data().expiresAt.toMillis() > now.toMillis())
      .map(d => ({ id: d.id, ...d.data() }));
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, contentId, contentType, contentTitle, streamUrl } = req.body;
    const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 chars
    
    const roomRef = admin.firestore().collection('rooms').doc();
    const roomData = {
      name,
      ownerId: req.user.uid,
      hostId: req.user.uid,
      members: [req.user.uid],
      inviteCode,
      contentId: contentId || null,
      contentType: contentType || null,
      contentTitle: contentTitle || null,
      streamUrl: streamUrl || null,
      playback: { playing: false, position: 0, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: req.user.uid },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + ROOM_TTL_MS)),
    };
    await roomRef.set(roomData);
    res.json({ id: roomRef.id, ...roomData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/join', async (req, res) => {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) return res.status(400).json({ error: 'Invite code required' });

    const sn = await admin.firestore().collection('rooms').where('inviteCode', '==', inviteCode.toUpperCase()).limit(1).get();
    if (sn.empty) return res.status(404).json({ error: 'Invalid invite code' });

    const roomDoc = sn.docs[0];
    const roomRef = admin.firestore().collection('rooms').doc(roomDoc.id);

    await roomRef.update({
      members: admin.firestore.FieldValue.arrayUnion(req.user.uid)
    });

    res.json({ id: roomDoc.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:roomId', async (req, res) => {
  try {
    const doc = await admin.firestore().collection('rooms').doc(req.params.roomId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    const data = doc.data();
    if (data.expiresAt && data.expiresAt.toMillis() < Date.now()) {
      await doc.ref.delete();
      io.to(req.params.roomId).emit('room:deleted');
      return res.status(404).json({ error: 'Room has expired' });
    }
    if (!data.members.includes(req.user.uid)) return res.status(403).json({ error: 'Forbidden' });
    res.json({ id: doc.id, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:roomId', async (req, res) => {
  try {
    const roomRef = admin.firestore().collection('rooms').doc(req.params.roomId);
    const docSnap = await roomRef.get();
    if (!docSnap.exists) return res.status(404).json({ error: 'Not found' });
    if (docSnap.data().ownerId !== req.user.uid) return res.status(403).json({ error: 'Forbidden' });

    const updates = {};
    if (req.body.streamUrl  !== undefined) updates.streamUrl  = req.body.streamUrl;
    if (req.body.streamType !== undefined) updates.streamType = req.body.streamType;
    if (req.body.contentId !== undefined) updates.contentId = req.body.contentId;
    if (req.body.contentType !== undefined) updates.contentType = req.body.contentType;
    if (req.body.contentTitle !== undefined) updates.contentTitle = req.body.contentTitle;
    if (req.body.episodeId !== undefined) updates.episodeId = req.body.episodeId;
    if (req.body.tracks !== undefined) updates.tracks = req.body.tracks;
    if (req.body.magnetFileIdx !== undefined) updates.magnetFileIdx = req.body.magnetFileIdx ?? null;

    await roomRef.update(updates);
    // Notify all clients in the socket room so non-hosts get the new stream URL immediately
    io.to(req.params.roomId).emit('room:content-updated', updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get last 50 messages for a room (no Firestore client rules needed)
router.get('/:roomId/messages', async (req, res) => {
  try {
    const roomDoc = await admin.firestore().collection('rooms').doc(req.params.roomId).get();
    if (!roomDoc.exists) return res.status(404).json({ error: 'Not found' });
    if (!roomDoc.data().members.includes(req.user.uid)) return res.status(403).json({ error: 'Forbidden' });

    const snap = await admin.firestore()
      .collection('rooms').doc(req.params.roomId).collection('messages')
      .orderBy('createdAt', 'desc').limit(50).get();

    const messages = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toMillis?.() || Date.now()
    })).reverse();

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:roomId', async (req, res) => {
  try {
    const roomRef = admin.firestore().collection('rooms').doc(req.params.roomId);
    const docSnap = await roomRef.get();
    if (!docSnap.exists) return res.status(404).json({ error: 'Not found' });
    if (docSnap.data().ownerId !== req.user.uid) return res.status(403).json({ error: 'Forbidden' });

    await roomRef.delete();
    // Kick everyone out of the socket room before they notice the doc is gone
    io.to(req.params.roomId).emit('room:deleted');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

return router;
}
