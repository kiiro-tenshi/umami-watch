import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

// ── Firebase mocks ─────────────────────────────────────────────────────────
const mockOnAuthStateChanged = vi.hoisted(() => vi.fn());
const mockSignIn = vi.hoisted(() => vi.fn());
const mockSignOut = vi.hoisted(() => vi.fn());
const mockGetDoc = vi.hoisted(() => vi.fn());
const mockSetDoc = vi.hoisted(() => vi.fn());

vi.mock('../firebase', () => ({
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('test-token') } },
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: mockOnAuthStateChanged,
  signInWithEmailAndPassword: mockSignIn,
  createUserWithEmailAndPassword: vi.fn(),
  signOut: mockSignOut,
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  updateProfile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'doc-ref'),
  getDoc: mockGetDoc,
  setDoc: mockSetDoc,
  serverTimestamp: vi.fn(() => '__TS__'),
}));

import { AuthProvider, useAuth } from './useAuth.jsx';

// Helper component to read auth context
function AuthConsumer({ onValue }) {
  const value = useAuth();
  onValue(value);
  return <div data-testid="status">{value.loading ? 'loading' : value.user ? 'authed' : 'anon'}</div>;
}

describe('AuthProvider', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders children once loading is false (no user)', async () => {
    // Simulate no user logged in
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      cb(null);
      return vi.fn(); // unsubscribe
    });

    render(
      <AuthProvider>
        <div data-testid="child">App</div>
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('child')).toBeInTheDocument());
  });

  it('sets user after auth state resolves with a logged-in Firebase user', async () => {
    const firebaseUser = {
      uid: 'u-123',
      email: 'test@test.com',
      displayName: 'Test User',
      photoURL: null,
    };

    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ rdApiKey: 'key-xyz' }) });
    mockSetDoc.mockResolvedValueOnce(undefined);

    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      cb(firebaseUser);
      return vi.fn();
    });

    let capturedValue;
    render(
      <AuthProvider>
        <AuthConsumer onValue={(v) => { capturedValue = v; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authed');
    });
    expect(capturedValue.user.uid).toBe('u-123');
    expect(capturedValue.user.email).toBe('test@test.com');
  });

  it('creates a Firestore doc for a brand-new user', async () => {
    const newUser = { uid: 'new-u', email: 'new@test.com', displayName: null, photoURL: null };

    mockGetDoc.mockResolvedValueOnce({ exists: () => false });
    mockSetDoc.mockResolvedValueOnce(undefined);

    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      cb(newUser);
      return vi.fn();
    });

    render(
      <AuthProvider>
        <div data-testid="child">ok</div>
      </AuthProvider>
    );

    await waitFor(() => screen.getByTestId('child'));
    // setDoc called twice: once to create, once to set lastSeen (first call has createdAt)
    expect(mockSetDoc).toHaveBeenCalledWith(
      'doc-ref',
      expect.objectContaining({ uid: 'new-u', createdAt: '__TS__' }),
      { merge: true }
    );
  });

  it('provides a logout function that calls signOut', async () => {
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      cb(null);
      return vi.fn();
    });
    mockSignOut.mockResolvedValueOnce(undefined);

    let capturedValue;
    render(
      <AuthProvider>
        <AuthConsumer onValue={(v) => { capturedValue = v; }} />
      </AuthProvider>
    );

    await waitFor(() => screen.getByTestId('status'));
    await act(() => capturedValue.logout());

    expect(mockSignOut).toHaveBeenCalledOnce();
  });
});


describe('sticker profile persistence', () => {
  it.each([true, false])('updates local settings only if the profile save succeeds (success=%s)', async success => {
    vi.clearAllMocks();
    const originalPacks = [{ name: 'Cats', title: 'Cats', enabled: true, shared: false }];
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ telegramStickerPacks: originalPacks }) });
    mockSetDoc.mockResolvedValueOnce(undefined);
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      cb({ uid: 'u1', email: 'test@test.com', displayName: 'Tester', photoURL: null });
      return vi.fn();
    });
    const mockFetch = vi.fn().mockResolvedValue({ ok: success, json: async () => ({ error: 'Save failed' }) });
    vi.stubGlobal('fetch', mockFetch);
    try {
      let context;
      render(<AuthProvider><AuthConsumer onValue={value => { context = value; }} /></AuthProvider>);
      await waitFor(() => expect(context.user?.telegramStickerPacks).toEqual(originalPacks));
      await act(async () => {
        const save = context.updateUserProfile({ telegramStickerPacks: [] });
        if (success) await save;
        else await expect(save).rejects.toThrow('Save failed');
      });
      expect(context.user.telegramStickerPacks).toEqual(success ? [] : originalPacks);
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/me'), expect.objectContaining({
        method: 'PATCH', body: JSON.stringify({ telegramStickerPacks: [] }),
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
