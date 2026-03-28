import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTorrentioStreams } from './torrentio.js';

describe('getTorrentioStreams', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  const mockStreams = [
    { title: '1080p BluRay.mp4', infoHash: 'abc123', sources: ['tracker:udp://tracker.example.com:6969'] },
    { title: '720p WEB.mkv', infoHash: 'def456', sources: [] },
  ];

  it('fetches movie streams from the correct Torrentio URL', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ streams: mockStreams }),
    });

    const result = await getTorrentioStreams('movie', 'tt1234567');

    expect(fetch).toHaveBeenCalledWith('https://torrentio.strem.fun/stream/movie/tt1234567.json');
    expect(result).toHaveLength(2);
    expect(result[0].infoHash).toBe('abc123');
  });

  it('builds correct URL for TV episodes', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ streams: [mockStreams[0]] }),
    });

    await getTorrentioStreams('tv', 'tt9876543', 2, 5);

    expect(fetch).toHaveBeenCalledWith(
      'https://torrentio.strem.fun/stream/series/tt9876543:2:5.json'
    );
  });

  it('builds correct URL for anime using Kitsu ID and absolute episode', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ streams: mockStreams }),
    });

    await getTorrentioStreams('anime', '12345', null, null, 7);

    expect(fetch).toHaveBeenCalledWith(
      'https://torrentio.strem.fun/stream/anime/kitsu:12345:7.json'
    );
  });

  it('returns empty array on API error (does not throw)', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await getTorrentioStreams('movie', 'tt000');
    expect(result).toEqual([]);
  });

  it('throws when called with invalid parameters', async () => {
    await expect(getTorrentioStreams('tv', 'tt123')).rejects.toThrow('Invalid parameters');
  });

  it('throws when externalId is missing', async () => {
    await expect(getTorrentioStreams('movie', null)).rejects.toThrow('ID is required');
  });

  it('returns empty array when response has no streams field', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const result = await getTorrentioStreams('movie', 'tt111');
    expect(result).toEqual([]);
  });
});
