import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockVerifyIdToken = vi.hoisted(() => vi.fn());
const mockFsGet = vi.hoisted(() => vi.fn());
const mockFsUpdate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFsAdd = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'msg-new' }));

vi.mock('firebase-admin', () => ({
  default: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
    firestore: Object.assign(
      () => ({
        collection: () => ({
          doc: vi.fn(() => ({
            get: mockFsGet,
            update: mockFsUpdate,
            collection: () => ({ add: mockFsAdd }),
          })),
        }),
      }),
      { FieldValue: { serverTimestamp: () => '__TS__' } }
    ),
  },
}));

const { default: setupSockets } = await import('../../socket/roomSocket.js');

// ── Socket mock helpers ────────────────────────────────────────────────────
function makeSocket(overrides = {}) {
  const listeners = {};
  // Use a SINGLE persistent emit spy so assertions after the handler runs
  // check the same spy that was actually called (not a fresh one).
  const toEmit = vi.fn();
  return {
    user: { uid: 'uid-host' },
    roomId: null,
    isHost: false,
    displayName: 'TestUser',
    photoURL: null,
    handshake: { auth: { token: 'test-token' } },
    id: 'socket-1',
    join: vi.fn(),
    leave: vi.fn(),
    to: vi.fn(() => ({ emit: toEmit })),
    _toEmit: toEmit,   // exposed so tests can assert on it
    emit: vi.fn(),
    on: vi.fn((event, handler) => { listeners[event] = handler; }),
    _listeners: listeners,
    _trigger: (event, ...args) => listeners[event]?.(...args),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('setupSockets', () => {
  let io, socket, ioMiddleware, connectionHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    socket = makeSocket();

    let ioToEmit = vi.fn();
    io = {
      use: vi.fn((fn) => { ioMiddleware = fn; }),
      on: vi.fn((event, fn) => { if (event === 'connection') connectionHandler = fn; }),
      to: vi.fn(() => ({ emit: ioToEmit })),
      _toEmit: ioToEmit,
      in: vi.fn(() => ({ fetchSockets: vi.fn().mockResolvedValue([socket]) })),
    };
    setupSockets(io);
  });

  describe('auth middleware', () => {
    it('attaches user to socket when token is valid', async () => {
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'u1', email: 'u@test.com' });
      const next = vi.fn();
      await ioMiddleware(socket, next);
      expect(socket.user).toMatchObject({ uid: 'u1' });
      expect(next).toHaveBeenCalledWith(); // no error
    });

    it('calls next with error when no token', async () => {
      socket.handshake.auth.token = null;
      const next = vi.fn();
      await ioMiddleware(socket, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('calls next with error when token is invalid', async () => {
      mockVerifyIdToken.mockRejectedValueOnce(new Error('Bad token'));
      const next = vi.fn();
      await ioMiddleware(socket, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('join-room', () => {
    beforeEach(() => {
      socket.user = { uid: 'uid-host' };
      connectionHandler(socket);
    });

    it('joins socket room and emits sync:state to the joining socket', async () => {
      const playback = { playing: false, position: 0 };
      mockFsGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ members: ['uid-host'], hostId: 'uid-host', playback }),
      });

      await socket._trigger('join-room', { roomId: 'r1', displayName: 'Host', photoURL: null });

      expect(socket.join).toHaveBeenCalledWith('r1');
      expect(socket.roomId).toBe('r1');
      expect(socket.emit).toHaveBeenCalledWith('sync:state', playback);
    });

    it('emits error when user is not a room member', async () => {
      mockFsGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ members: ['someone-else'], hostId: 'someone-else' }),
      });

      await socket._trigger('join-room', { roomId: 'r1', displayName: 'Intruder' });

      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('error', 'Room access denied');
    });
  });

  describe('playback sync (host only)', () => {
    beforeEach(() => {
      socket.user = { uid: 'uid-host' };
      socket.roomId = 'r1';
      socket.isHost = true;
      connectionHandler(socket);
    });

    it('broadcasts playback:play and updates Firestore', async () => {
      await socket._trigger('playback:play', 42.5);

      expect(socket.to).toHaveBeenCalledWith('r1');
      expect(socket._toEmit).toHaveBeenCalledWith('playback:play', 42.5);
      expect(mockFsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ playback: expect.objectContaining({ playing: true, position: 42.5 }) })
      );
    });

    it('broadcasts playback:pause and updates Firestore', async () => {
      await socket._trigger('playback:pause', 10);

      expect(socket.to).toHaveBeenCalledWith('r1');
      expect(socket._toEmit).toHaveBeenCalledWith('playback:pause', 10);
      expect(mockFsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ playback: expect.objectContaining({ playing: false, position: 10 }) })
      );
    });

    it('ignores playback events from non-host sockets', () => {
      socket.isHost = false;
      socket._trigger('playback:play', 5);
      expect(socket._toEmit).not.toHaveBeenCalled();
    });

    it('broadcasts heartbeat as sync:state to room', () => {
      socket._trigger('playback:heartbeat', { position: 60, playing: true });

      expect(socket.to).toHaveBeenCalledWith('r1');
      expect(socket._toEmit).toHaveBeenCalledWith('sync:state', { position: 60, playing: true });
    });
  });

  describe('chat', () => {
    beforeEach(() => {
      socket.user = { uid: 'uid-1' };
      socket.roomId = 'chat-room';
      socket.displayName = 'ChatUser';
      connectionHandler(socket);
    });

    it('saves message to Firestore and broadcasts to room', async () => {
      await socket._trigger('chat:message', 'Hello world!');

      expect(mockFsAdd).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Hello world!', uid: 'uid-1' })
      );
      expect(io.to).toHaveBeenCalledWith('chat-room');
    });

    it('rejects empty messages', async () => {
      await socket._trigger('chat:message', '   ');
      expect(mockFsAdd).not.toHaveBeenCalled();
    });

    it('rejects messages over 500 characters', async () => {
      await socket._trigger('chat:message', 'x'.repeat(501));
      expect(mockFsAdd).not.toHaveBeenCalled();
    });
  });

  describe('chat:typing', () => {
    beforeEach(() => {
      socket.user = { uid: 'uid-1' };
      socket.displayName = 'TypingUser';
      connectionHandler(socket);
    });

    it('broadcasts typing indicator to room when socket is in a room', () => {
      socket.roomId = 'room-typing';
      socket._trigger('chat:typing');

      expect(socket.to).toHaveBeenCalledWith('room-typing');
      expect(socket._toEmit).toHaveBeenCalledWith('chat:typing', { displayName: 'TypingUser' });
    });

    it('does nothing when socket has no roomId', () => {
      socket.roomId = null;
      socket._trigger('chat:typing');

      expect(socket._toEmit).not.toHaveBeenCalled();
    });
  });

  describe('playback:seek', () => {
    beforeEach(() => {
      socket.user = { uid: 'uid-host' };
      socket.roomId = 'r1';
      socket.isHost = true;
      connectionHandler(socket);
    });

    it('broadcasts seek position and updates Firestore position field only', async () => {
      await socket._trigger('playback:seek', 123.4);

      expect(socket.to).toHaveBeenCalledWith('r1');
      expect(socket._toEmit).toHaveBeenCalledWith('playback:seek', 123.4);
      expect(mockFsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ 'playback.position': 123.4 })
      );
      // Must NOT overwrite the playing state
      expect(mockFsUpdate).not.toHaveBeenCalledWith(
        expect.objectContaining({ playback: expect.anything() })
      );
    });

    it('ignores seek from non-host sockets', () => {
      socket.isHost = false;
      socket._trigger('playback:seek', 50);

      expect(socket._toEmit).not.toHaveBeenCalled();
      expect(mockFsUpdate).not.toHaveBeenCalled();
    });
  });

  describe('leave-room', () => {
    beforeEach(() => {
      socket.user = { uid: 'uid-1' };
      socket.roomId = 'room-leave';
      socket.isHost = true;
      socket.displayName = 'Leaver';
      connectionHandler(socket);
    });

    it('broadcasts user-left, calls socket.leave, and clears roomId/isHost', () => {
      socket._trigger('leave-room');

      expect(socket.to).toHaveBeenCalledWith('room-leave');
      expect(socket._toEmit).toHaveBeenCalledWith('user-left', { uid: 'uid-1', displayName: 'Leaver' });
      expect(socket.leave).toHaveBeenCalledWith('room-leave');
      expect(socket.roomId).toBeNull();
      expect(socket.isHost).toBe(false);
    });

    it('does nothing when socket is not in a room', () => {
      socket.roomId = null;
      socket._trigger('leave-room');

      expect(socket._toEmit).not.toHaveBeenCalled();
      expect(socket.leave).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    beforeEach(() => {
      socket.user = { uid: 'uid-1' };
      socket.displayName = 'Disconnecter';
      connectionHandler(socket);
    });

    it('broadcasts user-left to room when socket had a roomId', () => {
      socket.roomId = 'room-disc';
      socket._trigger('disconnect');

      expect(socket.to).toHaveBeenCalledWith('room-disc');
      expect(socket._toEmit).toHaveBeenCalledWith('user-left', { uid: 'uid-1', displayName: 'Disconnecter' });
    });

    it('does nothing when socket was not in a room', () => {
      socket.roomId = null;
      socket._trigger('disconnect');

      expect(socket._toEmit).not.toHaveBeenCalled();
    });
  });

  describe('request-sync', () => {
    it('finds the host socket in the room and emits viewer-needs-sync to it', async () => {
      const hostSocket = makeSocket({ isHost: true, user: { uid: 'uid-host' } });
      hostSocket.emit = vi.fn();

      io.in = vi.fn(() => ({ fetchSockets: vi.fn().mockResolvedValue([hostSocket, socket]) }));

      socket.user = { uid: 'uid-viewer' };
      socket.roomId = 'r1';
      socket.isHost = false;
      socket.id = 'viewer-socket-id';
      connectionHandler(socket);

      await socket._trigger('request-sync');

      expect(hostSocket.emit).toHaveBeenCalledWith('viewer-needs-sync', 'viewer-socket-id');
    });

    it('does nothing when socket is the host', async () => {
      socket.user = { uid: 'uid-host' };
      socket.roomId = 'r1';
      socket.isHost = true;
      connectionHandler(socket);

      const fetchSockets = vi.fn();
      io.in = vi.fn(() => ({ fetchSockets }));

      await socket._trigger('request-sync');

      expect(fetchSockets).not.toHaveBeenCalled();
    });
  });

  describe('sync-response', () => {
    it('emits sync:state directly to the requesting viewer socket', () => {
      socket.user = { uid: 'uid-host' };
      socket.roomId = 'r1';
      socket.isHost = true;
      connectionHandler(socket);

      socket._trigger('sync-response', { viewerSocketId: 'viewer-id-99', position: 42, playing: true });

      expect(io.to).toHaveBeenCalledWith('viewer-id-99');
      expect(io._toEmit).toHaveBeenCalledWith('sync:state', { position: 42, playing: true });
    });

    it('ignores sync-response from non-host sockets', () => {
      socket.user = { uid: 'uid-viewer' };
      socket.roomId = 'r1';
      socket.isHost = false;
      connectionHandler(socket);

      socket._trigger('sync-response', { viewerSocketId: 'viewer-id-99', position: 0, playing: false });

      expect(io._toEmit).not.toHaveBeenCalled();
    });
  });

  describe('join-room — content-updated and host-offline warning', () => {
    beforeEach(() => {
      socket.user = { uid: 'uid-viewer' };
      connectionHandler(socket);
    });

    it('emits room:content-updated when room already has a streamUrl', async () => {
      const roomData = {
        members: ['uid-viewer'],
        hostId: 'uid-host',
        playback: { playing: false, position: 0 },
        streamUrl: 'https://cdn.example.com/video.mp4',
        contentType: 'anime',
        contentTitle: 'Frieren Ep 1',
        tracks: [],
      };
      mockFsGet.mockResolvedValueOnce({ exists: true, data: () => roomData });
      io.in = vi.fn(() => ({
        fetchSockets: vi.fn().mockResolvedValue([
          makeSocket({ user: { uid: 'uid-host' }, isHost: true }),
        ]),
      }));

      await socket._trigger('join-room', { roomId: 'r1', displayName: 'Viewer', photoURL: null });

      expect(socket.emit).toHaveBeenCalledWith(
        'room:content-updated',
        expect.objectContaining({ streamUrl: 'https://cdn.example.com/video.mp4', contentType: 'anime' })
      );
    });

    it('emits warning when host is not connected', async () => {
      mockFsGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ members: ['uid-viewer'], hostId: 'uid-host', playback: {} }),
      });
      // No host socket in the room
      io.in = vi.fn(() => ({ fetchSockets: vi.fn().mockResolvedValue([socket]) }));

      await socket._trigger('join-room', { roomId: 'r1', displayName: 'Viewer', photoURL: null });

      expect(socket.emit).toHaveBeenCalledWith('warning', expect.stringContaining('Host is not connected'));
    });
  });
});
