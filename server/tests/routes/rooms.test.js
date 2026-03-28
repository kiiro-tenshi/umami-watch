import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mocks ──────────────────────────────────────────────────────────────────
const {
  mockVerifyIdToken,
  mockFsGet,
  mockFsSet,
  mockFsUpdate,
  mockFsDelete,
  mockFsAdd,
  mockIoEmit,
} = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
  mockFsGet: vi.fn(),
  mockFsSet: vi.fn().mockResolvedValue(undefined),
  mockFsUpdate: vi.fn().mockResolvedValue(undefined),
  mockFsDelete: vi.fn().mockResolvedValue(undefined),
  mockFsAdd: vi.fn().mockResolvedValue({ id: 'msg-1' }),
  mockIoEmit: vi.fn(),
}));

vi.mock('firebase-admin', () => ({
  default: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
    firestore: Object.assign(
      () => ({
        collection: () => ({
          doc: vi.fn(() => ({
            id: 'room-123',
            get: mockFsGet,
            set: mockFsSet,
            update: mockFsUpdate,
            delete: mockFsDelete,
            collection: () => ({
              get: mockFsGet,
              add: mockFsAdd,
              orderBy: () => ({ limit: () => ({ get: mockFsGet }) }),
            }),
          })),
          where: () => ({
            limit: () => ({ get: mockFsGet }),
            get: mockFsGet,
          }),
          get: mockFsGet,
        }),
      }),
      {
        FieldValue: {
          serverTimestamp: () => '__TS__',
          arrayUnion: (...args) => args[0],
        },
      }
    ),
  },
}));

vi.mock('crypto', () => ({
  default: { randomBytes: (n) => ({ toString: () => 'ABC123' }) },
  randomBytes: (n) => ({ toString: () => 'ABC123' }),
}));

// ── App setup ──────────────────────────────────────────────────────────────
const { default: createRoomRouter } = await import('../../routes/rooms.js');

const io = { to: vi.fn(() => ({ emit: mockIoEmit })) };
const app = express();
app.use(express.json());
app.use('/', createRoomRouter(io));

const AUTH = { Authorization: 'Bearer valid-token' };
const USER_ID = 'user-owner-1';

// ── Tests ──────────────────────────────────────────────────────────────────
describe('GET /api/rooms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: USER_ID });
  });

  it('returns rooms the user is a member of', async () => {
    mockFsGet.mockResolvedValueOnce({
      docs: [
        { id: 'r1', data: () => ({ name: 'Room One', members: [USER_ID] }) },
        { id: 'r2', data: () => ({ name: 'Room Two', members: [USER_ID] }) },
      ],
    });

    const res = await request(app).get('/').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: 'r1', name: 'Room One' });
    expect(res.body[1]).toMatchObject({ id: 'r2', name: 'Room Two' });
  });

  it('returns empty array when user has no rooms', async () => {
    mockFsGet.mockResolvedValueOnce({ docs: [] });

    const res = await request(app).get('/').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/rooms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: USER_ID });
  });

  it('creates a room with required fields and returns it', async () => {
    const res = await request(app)
      .post('/')
      .set(AUTH)
      .send({ name: 'Watch Party' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'room-123',
      name: 'Watch Party',
      ownerId: USER_ID,
      hostId: USER_ID,
      members: [USER_ID],
      inviteCode: 'ABC123',
    });
    expect(mockFsSet).toHaveBeenCalledOnce();
  });
});

describe('POST /api/rooms/join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: USER_ID });
  });

  it('adds user to room when invite code is valid', async () => {
    mockFsGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'invite-room-99', data: () => ({ name: 'Test Room' }), ref: { id: 'invite-room-99' } }],
    });

    const res = await request(app)
      .post('/join')
      .set(AUTH)
      .send({ inviteCode: 'XYZ456' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'invite-room-99' }); // endpoint returns roomDoc.id from the query
    expect(mockFsUpdate).toHaveBeenCalledWith({ members: USER_ID });
  });

  it('returns 404 when invite code is invalid', async () => {
    mockFsGet.mockResolvedValueOnce({ empty: true, docs: [] });

    const res = await request(app)
      .post('/join')
      .set(AUTH)
      .send({ inviteCode: 'INVALID' });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Invalid invite code' });
  });

  it('returns 400 when invite code is missing', async () => {
    const res = await request(app).post('/join').set(AUTH).send({});

    expect(res.status).toBe(400);
  });
});

describe('GET /api/rooms/:roomId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: USER_ID });
  });

  it('returns room data for a member', async () => {
    mockFsGet.mockResolvedValueOnce({
      exists: true,
      id: 'room-123',
      data: () => ({ name: 'My Room', members: [USER_ID], hostId: USER_ID }),
    });

    const res = await request(app).get('/room-123').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'room-123', name: 'My Room' });
  });

  it('returns 403 for a non-member', async () => {
    mockFsGet.mockResolvedValueOnce({
      exists: true,
      id: 'room-123',
      data: () => ({ name: 'Other Room', members: ['someone-else'], hostId: 'someone-else' }),
    });

    const res = await request(app).get('/room-123').set(AUTH);

    expect(res.status).toBe(403);
  });

  it('returns 404 when room does not exist', async () => {
    mockFsGet.mockResolvedValueOnce({ exists: false });

    const res = await request(app).get('/nonexistent').set(AUTH);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/rooms/:roomId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: USER_ID });
  });

  it('allows room owner to update content fields', async () => {
    mockFsGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ownerId: USER_ID, name: 'Room' }),
    });

    const res = await request(app)
      .patch('/room-123')
      .set(AUTH)
      .send({ streamUrl: 'https://example.com/video.mp4', contentType: 'movie' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mockFsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ streamUrl: 'https://example.com/video.mp4', contentType: 'movie' })
    );
    expect(io.to).toHaveBeenCalledWith('room-123');
    expect(mockIoEmit).toHaveBeenCalledWith('room:content-updated', expect.any(Object));
  });

  it('accepts magnetFileIdx in update', async () => {
    mockFsGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ownerId: USER_ID }),
    });

    const res = await request(app)
      .patch('/room-123')
      .set(AUTH)
      .send({ streamUrl: 'magnet:?xt=urn:btih:abc123', magnetFileIdx: 2 });

    expect(res.status).toBe(200);
    expect(mockFsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ magnetFileIdx: 2 })
    );
  });

  it('returns 403 when user is not the owner', async () => {
    mockFsGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ownerId: 'different-user' }),
    });

    const res = await request(app)
      .patch('/room-123')
      .set(AUTH)
      .send({ streamUrl: 'https://hack.com' });

    expect(res.status).toBe(403);
    expect(mockFsUpdate).not.toHaveBeenCalled();
  });
});

describe('GET /api/rooms/:roomId/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: USER_ID });
  });

  it('returns last 50 messages in chronological order', async () => {
    // First get: room membership check
    mockFsGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ members: [USER_ID] }),
    });
    // Second get: messages subcollection query
    mockFsGet.mockResolvedValueOnce({
      docs: [
        { id: 'msg-2', data: () => ({ text: 'Hello', uid: USER_ID, createdAt: { toMillis: () => 2000 } }) },
        { id: 'msg-1', data: () => ({ text: 'World', uid: USER_ID, createdAt: { toMillis: () => 1000 } }) },
      ],
    });

    const res = await request(app).get('/room-123/messages').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // .reverse() means msg-1 (createdAt 1000) comes first
    expect(res.body[0].text).toBe('World');
    expect(res.body[1].text).toBe('Hello');
  });
});

describe('DELETE /api/rooms/:roomId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: USER_ID });
  });

  it('allows owner to delete room and emits room:deleted', async () => {
    mockFsGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ownerId: USER_ID }),
    });

    const res = await request(app).delete('/room-123').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mockFsDelete).toHaveBeenCalledOnce();
    expect(io.to).toHaveBeenCalledWith('room-123');
    expect(mockIoEmit).toHaveBeenCalledWith('room:deleted');
  });

  it('returns 403 when non-owner tries to delete', async () => {
    mockFsGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ownerId: 'another-user' }),
    });

    const res = await request(app).delete('/room-123').set(AUTH);

    expect(res.status).toBe(403);
    expect(mockFsDelete).not.toHaveBeenCalled();
  });
});
