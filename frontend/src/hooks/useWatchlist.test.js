import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── Mocks ─────────────────────────────────────────────────────��────────────
const mockGetDocs  = vi.hoisted(() => vi.fn());
const mockSetDoc   = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockDeleteDoc = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(),
  query:           vi.fn(),
  where:           vi.fn(),
  getDocs:         mockGetDocs,
  doc:             vi.fn(() => 'doc-ref'),
  setDoc:          mockSetDoc,
  deleteDoc:       mockDeleteDoc,
  serverTimestamp: vi.fn(() => '__TS__'),
}));

import { useWatchlist } from './useWatchlist';

// ── Helpers ──────────────────────────────���────────────────────────────��────
/** Build a minimal Firestore snapshot forEach that iterates over the given docs. */
function makeSnap(docs) {
  return { forEach: (fn) => docs.forEach(fn) };
}

describe('useWatchlist', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Initial state ────────────────────────────���────────────────────────────
  it('returns an empty watchlist and loading=false when uid is null', async () => {
    const { result } = renderHook(() => useWatchlist(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.watchlist).toEqual([]);
  });

  it('fetches and populates watchlist items for a given uid', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([
      { id: 'u1_anime123', data: () => ({ contentId: 'anime123', contentType: 'anime', title: 'Naruto', uid: 'u1' }) },
      { id: 'u1_movie456', data: () => ({ contentId: 'movie456', contentType: 'movie', title: 'Inception', uid: 'u1' }) },
    ]));

    const { result } = renderHook(() => useWatchlist('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.watchlist).toHaveLength(2);
    expect(result.current.watchlist[0].contentId).toBe('anime123');
    expect(result.current.watchlist[1].contentId).toBe('movie456');
  });

  it('returns an empty list when the user has no watchlist items', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([]));
    const { result } = renderHook(() => useWatchlist('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.watchlist).toEqual([]);
  });

  // ── isInWatchlist ─────────────────────────────────────────��───────────────
  it('isInWatchlist returns true for a content ID that is in the watchlist', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([
      { id: 'u1_456', data: () => ({ contentId: '456', contentType: 'anime', title: 'Bleach', uid: 'u1' }) },
    ]));

    const { result } = renderHook(() => useWatchlist('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isInWatchlist('456')).toBe(true);
  });

  it('isInWatchlist returns false for a content ID not in the watchlist', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([]));
    const { result } = renderHook(() => useWatchlist('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isInWatchlist('999')).toBe(false);
  });

  it('isInWatchlist coerces numeric IDs to strings before comparing', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([
      { id: 'u1_789', data: () => ({ contentId: '789', contentType: 'movie', title: 'Interstellar', uid: 'u1' }) },
    ]));

    const { result } = renderHook(() => useWatchlist('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Pass numeric 789 — should match stored string '789'
    expect(result.current.isInWatchlist(789)).toBe(true);
  });

  // ── toggleWatchlist — add ────────────────────────��────────────────────────
  it('calls setDoc and adds item to state when toggling a new item', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([]));
    const { result } = renderHook(() => useWatchlist('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggleWatchlist({
        contentId: '999',
        contentType: 'anime',
        title: 'One Piece',
        posterUrl: 'https://cdn.example.com/op.jpg',
      });
    });

    expect(mockSetDoc).toHaveBeenCalledOnce();
    expect(result.current.watchlist).toHaveLength(1);
    expect(result.current.watchlist[0].contentId).toBe('999');
  });

  // ── toggleWatchlist — remove ──────────────────────────────────────────────
  it('calls deleteDoc and removes item from state when toggling an existing item', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([
      { id: 'u1_111', data: () => ({ contentId: '111', contentType: 'movie', title: 'Inception', uid: 'u1' }) },
    ]));

    const { result } = renderHook(() => useWatchlist('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggleWatchlist({ contentId: '111', contentType: 'movie', title: 'Inception' });
    });

    expect(mockDeleteDoc).toHaveBeenCalledOnce();
    expect(result.current.watchlist).toHaveLength(0);
  });

  // ── no-op when no uid ─────────────────────────────────────────────────────
  it('does nothing when toggleWatchlist is called with no uid', async () => {
    const { result } = renderHook(() => useWatchlist(null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggleWatchlist({ contentId: '123', contentType: 'anime', title: 'Test' });
    });

    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });
});
