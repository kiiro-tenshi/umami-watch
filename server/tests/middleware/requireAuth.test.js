import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifyIdToken = vi.hoisted(() => vi.fn());

vi.mock('firebase-admin', () => ({
  default: {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  },
}));

const { default: requireAuth } = await import('../../middleware/requireAuth.js');

describe('requireAuth middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {}, query: {} };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    next = vi.fn();
    vi.clearAllMocks();
  });

  it('returns 401 when no token is provided', async () => {
    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a valid Bearer token from Authorization header', async () => {
    req.headers.authorization = 'Bearer valid-token';
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'user-abc', email: 'a@b.com' });

    await requireAuth(req, res, next);

    expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token');
    expect(req.user).toEqual({ uid: 'user-abc', email: 'a@b.com' });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('accepts a valid token from query param when header is absent', async () => {
    req.query.token = 'query-param-token';
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'user-def' });

    await requireAuth(req, res, next);

    expect(mockVerifyIdToken).toHaveBeenCalledWith('query-param-token');
    expect(req.user.uid).toBe('user-def');
    expect(next).toHaveBeenCalledOnce();
  });

  it('prefers Authorization header token over query param token', async () => {
    req.headers.authorization = 'Bearer header-token';
    req.query.token = 'should-be-ignored';
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'u1' });

    await requireAuth(req, res, next);

    expect(mockVerifyIdToken).toHaveBeenCalledWith('header-token');
    expect(mockVerifyIdToken).toHaveBeenCalledTimes(1);
  });

  it('returns 401 with error details when token verification fails', async () => {
    req.headers.authorization = 'Bearer expired-token';
    mockVerifyIdToken.mockRejectedValueOnce(new Error('Token has been revoked'));

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      details: 'Token has been revoked',
    });
    expect(next).not.toHaveBeenCalled();
  });
});
