import admin from 'firebase-admin';

export default function setupSockets(io) {
  // auth middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) throw new Error('No token');
      const decodedUser = await admin.auth().verifyIdToken(token);
      socket.user = decodedUser;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const uid = socket.user.uid;

    socket.on('join-room', async ({ roomId, displayName, photoURL }) => {
      const roomSnap = await admin.firestore().collection('rooms').doc(roomId).get();
      if (!roomSnap.exists || !roomSnap.data().members.includes(uid)) {
        return socket.emit('error', 'Room access denied');
      }

      socket.join(roomId);
      socket.roomId = roomId;
      socket.displayName = displayName;
      socket.photoURL = photoURL || null;

      // Cache host status — avoids Firestore read on every playback event
      const roomData = roomSnap.data();
      socket.isHost = roomData.hostId === uid;

      socket.to(roomId).emit('user-joined', { uid, displayName });

      // Send current playback state to the joining viewer
      socket.emit('sync:state', roomData.playback);

      // Send current stream info so viewers who join after the host already
      // loaded a source don't get a white screen (they missed room:content-updated)
      if (roomData.streamUrl) {
        socket.emit('room:content-updated', {
          streamUrl:    roomData.streamUrl,
          contentType:  roomData.contentType,
          contentTitle: roomData.contentTitle,
          tracks:       roomData.tracks || [],
        });
      }

      const hostSockets = await io.in(roomId).fetchSockets();
      const hostConnected = hostSockets.some(s => s.user.uid === roomData.hostId);
      if (!hostConnected && !socket.isHost) {
        socket.emit('warning', 'Host is not connected. Playback may be out of sync.');
      }
    });

    socket.on('leave-room', () => {
      if (socket.roomId) {
        socket.to(socket.roomId).emit('user-left', { uid, displayName: socket.displayName });
        socket.leave(socket.roomId);
        socket.roomId = null;
        socket.isHost = false;
      }
    });

    socket.on('disconnect', () => {
      if (socket.roomId) {
        socket.to(socket.roomId).emit('user-left', { uid, displayName: socket.displayName });
      }
    });

    // Playback sync — host only
    // Broadcast immediately, then write to Firestore in background (no blocking)
    const guardHost = () => socket.roomId && socket.isHost;

    socket.on('playback:play', (pos) => {
      if (!guardHost()) return;
      // Broadcast first — no latency
      socket.to(socket.roomId).emit('playback:play', pos);
      // Write to Firestore in background for persistence
      admin.firestore().collection('rooms').doc(socket.roomId)
        .update({ playback: { playing: true, position: pos, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: uid } })
        .catch(() => {});
    });

    socket.on('playback:pause', (pos) => {
      if (!guardHost()) return;
      socket.to(socket.roomId).emit('playback:pause', pos);
      admin.firestore().collection('rooms').doc(socket.roomId)
        .update({ playback: { playing: false, position: pos, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: uid } })
        .catch(() => {});
    });

    socket.on('playback:seek', (pos) => {
      if (!guardHost()) return;
      socket.to(socket.roomId).emit('playback:seek', pos);
      // Use dot-notation to update only position — never clobber the playing state.
      // Overwriting playing:true here would corrupt the heartbeat when seeking while paused.
      admin.firestore().collection('rooms').doc(socket.roomId)
        .update({
          'playback.position':  pos,
          'playback.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
          'playback.updatedBy': uid,
        })
        .catch(() => {});
    });

    // Periodic heartbeat from host — viewers use this to correct drift
    // Host emits { position, playing } every ~3s
    socket.on('playback:heartbeat', ({ position, playing }) => {
      if (!guardHost()) return;
      socket.to(socket.roomId).emit('sync:state', { position, playing });
    });

    // Viewer requests a sync (e.g. after buffering)
    socket.on('request-sync', async () => {
      if (!socket.roomId || socket.isHost) return;
      // Find the host socket in the room and ask for their current position
      const roomSockets = await io.in(socket.roomId).fetchSockets();
      const hostSocket = roomSockets.find(s => s.isHost);
      if (hostSocket) {
        hostSocket.emit('viewer-needs-sync', socket.id);
      }
    });

    // Host responds with current position when a viewer needs sync
    socket.on('sync-response', ({ viewerSocketId, position, playing }) => {
      if (!guardHost()) return;
      io.to(viewerSocketId).emit('sync:state', { position, playing });
    });

    // Typing indicator
    socket.on('chat:typing', () => {
      if (!socket.roomId) return;
      socket.to(socket.roomId).emit('chat:typing', { displayName: socket.displayName });
    });

    // Chat — accepts { type: 'text', text } or { type: 'gif', gifUrl }
    socket.on('chat:message', async (payload) => {
      if (!socket.roomId) return;

      let msg;
      if (payload?.type === 'gif') {
        // Only allow Giphy CDN URLs (media0.giphy.com, media1.giphy.com, etc.)
        if (typeof payload.gifUrl !== 'string' || !/^https:\/\/media\d*\.giphy\.com\//.test(payload.gifUrl)) return;
        msg = { uid, displayName: socket.displayName, photoURL: socket.photoURL || null, type: 'gif', gifUrl: payload.gifUrl, createdAt: admin.firestore.FieldValue.serverTimestamp() };
      } else {
        // text (or legacy plain string)
        const text = typeof payload === 'string' ? payload : payload?.text;
        if (typeof text !== 'string' || !text.trim() || text.length > 500) return;
        msg = { uid, displayName: socket.displayName, photoURL: socket.photoURL || null, type: 'text', text: text.trim(), createdAt: admin.firestore.FieldValue.serverTimestamp() };
      }

      const docRef = await admin.firestore().collection('rooms').doc(socket.roomId).collection('messages').add(msg);
      io.to(socket.roomId).emit('chat:message', { id: docRef.id, ...msg, createdAt: Date.now() });
    });
  });
}
