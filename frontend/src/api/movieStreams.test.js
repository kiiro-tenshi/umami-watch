vi.mock('./movieSubtitles.js', () => ({ findMovieSubtitles: async () => [] }));
import { describe, expect, it, vi } from 'vitest';
vi.mock('../firebase.js', () => ({ auth: { currentUser: { getIdToken: async () => 'test-token' } } }));
import { resolveMovieStream } from './movieStreams.js';

describe('movie HLS resolution', () => {
  it('requires the Worker before fetching any sources', async () => {
    const fetch = vi.fn();
    await expect(resolveMovieStream({ type: 'movie', tmdbId: '550' }, '', { fetch })).rejects.toThrow('not configured');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns only a verified HLS source with the provider referer', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sources: [
      { label: 'VidZee dcloud HLS', embedUrl: 'https://player.vidzee.wtf/tv/1399/2/3', referer: 'https://player.vidzee.wtf/' },
    ] }) });
    const probe = vi.fn(sources => ({ first: Promise.resolve(sources[0]), complete: Promise.resolve(sources), cancel: vi.fn() }));
    const result = await resolveMovieStream({ type: 'tv', tmdbId: '1399', season: '2', episode: '3' }, 'https://worker.example/', { fetch, probe });
    expect(fetch.mock.calls[0][0]).toContain('season=2&episode=3');
    expect(result.source.type).toBe('hls');
    const url = new URL(result.source.url);
    expect(url.origin).toBe('https://worker.example');
    expect(url.searchParams.get('referer')).toBe('https://player.vidzee.wtf/');
    expect(url.searchParams.get('embed')).toBe('https://player.vidzee.wtf/tv/1399/2/3');
  });
  it('reports an unavailable source without returning an iframe', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sources: [] }) });
    await expect(resolveMovieStream({ type: 'movie', tmdbId: '550' }, 'https://worker.example/', { fetch })).rejects.toThrow('No working HLS stream');
  });
});
