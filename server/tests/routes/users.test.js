import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mocks (hoisted so vi.mock can reference them) ──────────────────────────
const {
  mockVerifyIdToken,
  mockFsGet,
  mockFsUpdate,
  mockBatchDelete,
  mockBatchCommit,
} = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
  mockFsGet: vi.fn(),
  mockFsUpdate: vi.fn().mockResolvedValue(undefined),
  mockBatchDelete: vi.fn(),
  mockBatchCommit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase-admin', () => ({
  default: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
    firestore: Object.assign(
      () => ({
        collection: () => ({
          doc: () => ({
            get: mockFsGet,
            update: mockFsUpdate,
            collection: () => ({
              get: mockFsGet,
            }),
          }),
        }),
        batch: () => ({ delete: mockBatchDelete, commit: mockBatchCommit }),
      }),
      { FieldValue: { serverTimestamp: () => '__TS__' } }
    ),
  },
}));

// ── App setup ──────────────────────────────────────────────────────────────
const { default: userRoutes } = await import('../../routes/users.js');

const app = express();
app.use(express.json());
app.use('/', userRoutes);

// ── Tests ──────────────────────────────────────────────────────────────────
describe('GET /api/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: 'uid-1' });
  });

  it('returns user data when doc exists', async () => {
    mockFsGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ displayName: 'Alice', email: 'alice@test.com' }),
    });

    const res = await request(app)
      .get('/')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ displayName: 'Alice', email: 'alice@test.com' });
  });

  it('returns 404 when user doc does not exist', async () => {
    mockFsGet.mockResolvedValueOnce({ exists: false });

    const res = await request(app)
      .get('/')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'User not found' });
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: 'uid-1' });
  });

  it('updates allowed fields and returns success', async () => {
    mockFsUpdate.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .patch('/')
      .set('Authorization', 'Bearer valid-token')
      .send({ displayName: 'Bob', photoURL: 'https://example.com/pic.jpg' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mockFsUpdate).toHaveBeenCalledWith({
      displayName: 'Bob',
      photoURL: 'https://example.com/pic.jpg',
    });
  });

  it('ignores unknown fields in the request body', async () => {
    mockFsUpdate.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .patch('/')
      .set('Authorization', 'Bearer valid-token')
      .send({ displayName: 'Charlie', unknownField: 'ignored' });

    expect(res.status).toBe(200);
    expect(mockFsUpdate).toHaveBeenCalledWith({ displayName: 'Charlie' });
  });
});

describe('DELETE /api/me/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: 'uid-1' });
  });

  it('deletes all history docs and returns count', async () => {
    const fakeDocs = [{ ref: 'ref1' }, { ref: 'ref2' }, { ref: 'ref3' }];
    mockFsGet.mockResolvedValueOnce({ docs: fakeDocs, size: fakeDocs.length });

    const res = await request(app)
      .delete('/history')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, deleted: 3 });
    expect(mockBatchDelete).toHaveBeenCalledTimes(3);
    expect(mockBatchCommit).toHaveBeenCalledOnce();
  });

  it('returns deleted: 0 when history is empty', async () => {
    mockFsGet.mockResolvedValueOnce({ docs: [], size: 0 });

    const res = await request(app)
      .delete('/history')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, deleted: 0 });
    expect(mockBatchDelete).not.toHaveBeenCalled();
  });
});
