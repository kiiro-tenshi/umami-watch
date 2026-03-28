import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchAnimeKitsu,
  getTrendingKitsu,
  getAnimeKitsuInfo,
  getKitsuEpisodes,
} from './kitsu.js';

const BASE = 'https://kitsu.io/api/edge';

// Minimal raw Kitsu item factory
function makeKitsuItem(id = '1', overrides = {}) {
  return {
    id,
    attributes: {
      canonicalTitle: 'Test Anime',
      titles: { en: 'Test Anime EN', en_jp: 'Test Anime JP' },
      synopsis: 'A test synopsis.',
      posterImage: { large: 'https://cdn.kitsu.io/poster.jpg', original: 'https://cdn.kitsu.io/orig.jpg' },
      coverImage: { large: 'https://cdn.kitsu.io/cover.jpg' },
      episodeCount: 12,
      averageRating: '80.00',
      status: 'finished',
      subtype: 'TV',
      startDate: '2020-01-01',
      ...overrides,
    },
  };
}

describe('searchAnimeKitsu', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns normalized results for a successful search', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [makeKitsuItem('42')] }),
    });

    const results = await searchAnimeKitsu('naruto');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/anime?filter[text]=naruto'));
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: '42',
      title: { english: 'Test Anime EN', romaji: 'Test Anime JP' },
      coverImage: { large: 'https://cdn.kitsu.io/poster.jpg' },
      episodes: 12,
      averageScore: 80,
    });
  });

  it('throws on a non-ok response', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(searchAnimeKitsu('x')).rejects.toThrow('Kitsu search failed: 503');
  });

  it('returns empty array when data is missing from response', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const results = await searchAnimeKitsu('empty');
    expect(results).toEqual([]);
  });
});

describe('getTrendingKitsu', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('fetches trending anime sorted by userCount', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [makeKitsuItem('1'), makeKitsuItem('2')] }),
    });

    const results = await getTrendingKitsu();

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('sort=-userCount'));
    expect(results).toHaveLength(2);
  });
});

describe('getAnimeKitsuInfo', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns normalized anime for a valid kitsu ID', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: makeKitsuItem('99') }),
    });

    const anime = await getAnimeKitsuInfo('99');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/anime/99'));
    expect(anime.id).toBe('99');
    expect(anime.status).toBe('Finished');
  });

  it('throws a 404 error with status property when anime not found', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const error = await getAnimeKitsuInfo('nonexistent').catch(e => e);
    expect(error.message).toContain('404');
    expect(error.status).toBe(404);
  });
});

describe('getKitsuEpisodes', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('fetches and normalizes episode list', async () => {
    const rawEps = [
      { id: 'e1', attributes: { number: 1, canonicalTitle: 'Pilot' } },
      { id: 'e2', attributes: { number: 2, canonicalTitle: null } },
    ];
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: rawEps, links: {} }),
    });

    const eps = await getKitsuEpisodes('123');

    expect(eps).toHaveLength(2);
    expect(eps[0]).toMatchObject({ id: 'e1', number: 1, title: 'Pilot', isFiller: false });
    expect(eps[1]).toMatchObject({ id: 'e2', number: 2, title: 'Episode 2' }); // fallback title
  });

  it('paginates until there are no more pages', async () => {
    const batch1 = Array.from({ length: 20 }, (_, i) => ({
      id: `e${i}`,
      attributes: { number: i + 1, canonicalTitle: `Episode ${i + 1}` },
    }));
    const batch2 = [{ id: 'e20', attributes: { number: 21, canonicalTitle: 'Last' } }];

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: batch1, links: { next: 'page2' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: batch2, links: {} }),
      });

    const eps = await getKitsuEpisodes('456');
    expect(eps).toHaveLength(21);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns empty array when the first fetch fails', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const eps = await getKitsuEpisodes('bad');
    expect(eps).toEqual([]);
  });
});
