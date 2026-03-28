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
      {
        FieldValue: {
          serverTimestamp: () => '__TS__',
        },
      }
    ),
  },
}));

const { default: setupSockets } = await import('../../socket/roomSocket.js');

// ── Socket mock helpers ────────────────────────────────────────────────────
function makeSocket(overrides = {}) {
  const listeners = {};
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
    to: vi.fn(() => ({ emit: vi.fn() })),
    emit: vi.fn(),
    on: vi.fn((event, handler) => { listeners[event] = handler; }),
    _listeners: listeners,
    _trigger: (event, ...args) => listeners[event]?.(...args),
    ...overrides,
  };
}

function makeIo(sockets = []) {
  return {
    use: vi.fn((fn) => { /* store middleware */ }),
    on: vi.fn(),
    to: vi.fn(() => ({ emit: vi.fn() })),
    in: vi.fn(() => ({ fetchSockets: vi.fn().mockResolvedValue(sockets) })),
    _middleware: null,
    _connectionHandlers: [],
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('setupSockets', () => {
  let io, socket, ioMiddleware, connectionHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    socket = makeSocket();
    io = {
      use: vi.fn((fn) => { ioMiddleware = fn; }),
      on: vi.fn((event, fn) => { if (event === 'connection') connectionHandler = fn; }),
      to: vi.fn(() => ({ emit: vi.fn() })),
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
      expect(next).toHaveBeenCalledWith(); // called with no error
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
      expect(socket.to('r1').emit).toHaveBeenCalledWith('playback:play', 42.5);
      expect(mockFsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ playback: expect.objectContaining({ playing: true, position: 42.5 }) })
      );
    });

    it('broadcasts playback:pause and updates Firestore', async () => {
      await socket._trigger('playback:pause', 10);

      expect(socket.to).toHaveBeenCalledWith('r1');
      expect(socket.to('r1').emit).toHaveBeenCalledWith('playback:pause', 10);
      expect(mockFsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ playback: expect.objectContaining({ playing: false, position: 10 }) })
      );
    });

    it('ignores playback events from non-host sockets', () => {
      socket.isHost = false;
      socket._trigger('playback:play', 5);
      expect(socket.to).not.toHaveBeenCalled();
    });

    it('broadcasts heartbeat as sync:state to room', () => {
      socket._trigger('playback:heartbeat', { position: 60, playing: true });

      expect(socket.to).toHaveBeenCalledWith('r1');
      expect(socket.to('r1').emit).toHaveBeenCalledWith('sync:state', { position: 60, playing: true });
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
});
