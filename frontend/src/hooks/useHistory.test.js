import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockGetDocs = vi.hoisted(() => vi.fn());

vi.mock('../firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query:      vi.fn(),
  orderBy:    vi.fn(),
  limit:      vi.fn(),
  getDocs:    mockGetDocs,
}));

import { useHistory } from './useHistory';

// ── Helpers ────────────────────────────────────────────────────────────────
function makeSnap(docs) {
  return { forEach: (fn) => docs.forEach(fn) };
}

describe('useHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array and loading=false immediately when uid is null', async () => {
    const { result } = renderHook(() => useHistory(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.history).toEqual([]);
  });

  it('fetches and returns history items for a uid', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([
      {
        id: 'anime_kitsu123',
        data: () => ({
          contentId: 'kitsu123',
          contentType: 'anime',
          title: 'Frieren: Beyond Journey\'s End',
          posterUrl: 'https://cdn.kitsu.io/frieren.jpg',
          position: 240,
          duration: 1440,
          epNum: 1,
        }),
      },
      {
        id: 'movie_27205',
        data: () => ({
          contentId: '27205',
          contentType: 'movie',
          title: 'Inception',
          posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
          position: 3600,
          duration: 8880,
        }),
      },
    ]));

    const { result } = renderHook(() => useHistory('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.history).toHaveLength(2);
    expect(result.current.history[0].contentId).toBe('kitsu123');
    expect(result.current.history[0].title).toBe("Frieren: Beyond Journey's End");
    expect(result.current.history[1].contentId).toBe('27205');
  });

  it('returns empty array when user has no history', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([]));
    const { result } = renderHook(() => useHistory('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.history).toEqual([]);
  });

  it('silently handles Firestore errors and returns loading=false', async () => {
    mockGetDocs.mockRejectedValueOnce(new Error('Firestore unavailable'));
    const { result } = renderHook(() => useHistory('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.history).toEqual([]);
  });

  it('exposes a setHistory function for external updates', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([]));
    const { result } = renderHook(() => useHistory('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.setHistory).toBe('function');
  });

  it('re-fetches when uid changes', async () => {
    mockGetDocs
      .mockResolvedValueOnce(makeSnap([{ id: 'a', data: () => ({ contentId: 'a1', contentType: 'anime', title: 'Show A' }) }]))
      .mockResolvedValueOnce(makeSnap([{ id: 'b', data: () => ({ contentId: 'b1', contentType: 'movie', title: 'Movie B' }) }]));

    const { result, rerender } = renderHook(({ uid }) => useHistory(uid), {
      initialProps: { uid: 'user-1' },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.history[0].contentId).toBe('a1');

    rerender({ uid: 'user-2' });
    await waitFor(() => expect(result.current.history[0]?.contentId).toBe('b1'));
  });
});
