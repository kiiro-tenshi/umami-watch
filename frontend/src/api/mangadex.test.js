import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock fetch ─────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  coverUrl,
  getCoverFilename,
  getAuthor,
  getTitle,
  getDescription,
  getTrendingManga,
  searchManga,
  getMangaByGenre,
  getMangaById,
  getMangaTags,
  getMangaChapters,
  getChapterPages,
} from './mangadex.js';

// ── Helpers ────────────────────────────────────────────────────────────────
function mockOkJson(data) {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => data });
}

function mockHttpError(status) {
  mockFetch.mockResolvedValueOnce({ ok: false, status, json: async () => ({}) });
}

/** Returns the URL string passed to the first fetch call. */
const calledUrl = () => mockFetch.mock.calls[0][0].toString();

// ── Pure helper: coverUrl ──────────────────────────────────────────────────
describe('coverUrl', () => {
  it('proxies through the server cover endpoint', () => {
    const url = coverUrl('manga-id-123', 'cover.jpg');
    expect(url).toContain('/api/proxy/mangadex-cover');
  });

  it('encodes the raw MangaDex uploads URL as a query param', () => {
    const url = coverUrl('manga-id-123', 'cover.jpg', 512);
    expect(url).toContain(encodeURIComponent('https://uploads.mangadex.org/covers/manga-id-123/cover.jpg.512.jpg'));
  });

  it('uses 256 as the default size', () => {
    const url = coverUrl('manga-id-123', 'cover.jpg');
    expect(url).toContain(encodeURIComponent('.256.jpg'));
  });

  it('respects a custom size parameter', () => {
    const url = coverUrl('manga-id-123', 'cover.jpg', 512);
    expect(url).toContain(encodeURIComponent('.512.jpg'));
  });
});

// ── Pure helper: getCoverFilename ──────────────────────────────────────────
describe('getCoverFilename', () => {
  it('extracts fileName from the cover_art relationship', () => {
    const manga = {
      relationships: [
        { type: 'author', attributes: { name: 'Author' } },
        { type: 'cover_art', attributes: { fileName: 'cover.jpg' } },
      ],
    };
    expect(getCoverFilename(manga)).toBe('cover.jpg');
  });

  it('returns null when no cover_art relationship exists', () => {
    const manga = { relationships: [{ type: 'author', attributes: { name: 'Author' } }] };
    expect(getCoverFilename(manga)).toBeNull();
  });

  it('returns null when relationships array is missing', () => {
    expect(getCoverFilename({})).toBeNull();
    expect(getCoverFilename({ relationships: [] })).toBeNull();
  });

  it('returns null when cover_art has no attributes', () => {
    const manga = { relationships: [{ type: 'cover_art' }] };
    expect(getCoverFilename(manga)).toBeNull();
  });
});

// ── Pure helper: getAuthor ─────────────────────────────────────────────────
describe('getAuthor', () => {
  it('extracts name from the author relationship', () => {
    const manga = {
      relationships: [
        { type: 'cover_art', attributes: { fileName: 'cover.jpg' } },
        { type: 'author', attributes: { name: 'Kanehito Yamada' } },
      ],
    };
    expect(getAuthor(manga)).toBe('Kanehito Yamada');
  });

  it('returns null when no author relationship exists', () => {
    const manga = { relationships: [{ type: 'cover_art', attributes: {} }] };
    expect(getAuthor(manga)).toBeNull();
  });

  it('returns null when relationships is missing', () => {
    expect(getAuthor({})).toBeNull();
  });
});

// ── Pure helper: getTitle ──────────────────────────────────────────────────
describe('getTitle', () => {
  it('prefers the English title', () => {
    const manga = { attributes: { title: { en: 'Frieren', ja: 'フリーレン' } } };
    expect(getTitle(manga)).toBe('Frieren');
  });

  it('falls back to ja-ro when en is absent', () => {
    const manga = { attributes: { title: { 'ja-ro': 'Sousou no Frieren', ja: 'フリーレン' } } };
    expect(getTitle(manga)).toBe('Sousou no Frieren');
  });

  it('falls back to ja when en and ja-ro are absent', () => {
    const manga = { attributes: { title: { ja: 'フリーレン' } } };
    expect(getTitle(manga)).toBe('フリーレン');
  });

  it('falls back to the first available key when no preferred language is present', () => {
    const manga = { attributes: { title: { ko: '프리렌' } } };
    expect(getTitle(manga)).toBe('프리렌');
  });

  it('returns "Unknown Title" when title object is empty', () => {
    const manga = { attributes: { title: {} } };
    expect(getTitle(manga)).toBe('Unknown Title');
  });

  it('returns "Unknown Title" when attributes or title is missing', () => {
    expect(getTitle({})).toBe('Unknown Title');
    expect(getTitle({ attributes: {} })).toBe('Unknown Title');
  });
});

// ── Pure helper: getDescription ────────────────────────────────────────────
describe('getDescription', () => {
  it('returns the English description', () => {
    const manga = { attributes: { description: { en: 'A story about an elf.', ja: '旅の話。' } } };
    expect(getDescription(manga)).toBe('A story about an elf.');
  });

  it('falls back to the first available description when en is absent', () => {
    const manga = { attributes: { description: { ja: '旅の話。' } } };
    expect(getDescription(manga)).toBe('旅の話。');
  });

  it('returns empty string when description is empty', () => {
    expect(getDescription({ attributes: { description: {} } })).toBe('');
  });

  it('returns empty string when description is missing', () => {
    expect(getDescription({})).toBe('');
    expect(getDescription({ attributes: {} })).toBe('');
  });
});

// ── API: getTrendingManga ──────────────────────────────────────────────────
describe('getTrendingManga', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the /manga endpoint with followedCount desc ordering', async () => {
    mockOkJson({ data: [] });
    await getTrendingManga();
    expect(calledUrl()).toContain('/manga');
    expect(calledUrl()).toContain('order%5BfollowedCount%5D=desc');
  });

  it('includes cover_art and author in includes[]', async () => {
    mockOkJson({ data: [] });
    await getTrendingManga();
    expect(calledUrl()).toContain('includes%5B%5D=cover_art');
    expect(calledUrl()).toContain('includes%5B%5D=author');
  });

  it('filters to English translations only', async () => {
    mockOkJson({ data: [] });
    await getTrendingManga();
    expect(calledUrl()).toContain('availableTranslatedLanguage%5B%5D=en');
  });

  it('returns data array from the response', async () => {
    const items = [{ id: 'm1', type: 'manga' }];
    mockOkJson({ data: items });
    const result = await getTrendingManga();
    expect(result).toEqual(items);
  });

  it('returns empty array when data is absent from response', async () => {
    mockOkJson({});
    const result = await getTrendingManga();
    expect(result).toEqual([]);
  });

  it('respects custom limit and offset', async () => {
    mockOkJson({ data: [] });
    await getTrendingManga(10, 20);
    expect(calledUrl()).toContain('limit=10');
    expect(calledUrl()).toContain('offset=20');
  });

  it('throws on HTTP error', async () => {
    mockHttpError(503);
    await expect(getTrendingManga()).rejects.toThrow('MangaDex error: 503');
  });
});

// ── API: searchManga ───────────────────────────────────────────────────────
describe('searchManga', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the /manga endpoint with the title query', async () => {
    mockOkJson({ data: [] });
    await searchManga('Frieren');
    expect(calledUrl()).toContain('/manga');
    expect(calledUrl()).toContain('title=Frieren');
  });

  it('returns the data array', async () => {
    const items = [{ id: 'm2', type: 'manga' }];
    mockOkJson({ data: items });
    const result = await searchManga('One Piece');
    expect(result).toEqual(items);
  });

  it('returns empty array when data is absent', async () => {
    mockOkJson({});
    expect(await searchManga('Unknown')).toEqual([]);
  });

  it('throws on HTTP error', async () => {
    mockHttpError(404);
    await expect(searchManga('NonExistent')).rejects.toThrow('MangaDex error: 404');
  });
});

// ── API: getMangaByGenre ───────────────────────────────────────────────────
describe('getMangaByGenre', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes the tag id in includedTags[]', async () => {
    mockOkJson({ data: [] });
    await getMangaByGenre('tag-id-action');
    expect(calledUrl()).toContain('includedTags%5B%5D=tag-id-action');
  });

  it('returns the data array', async () => {
    const items = [{ id: 'm3' }];
    mockOkJson({ data: items });
    expect(await getMangaByGenre('some-tag')).toEqual(items);
  });
});

// ── API: getMangaById ──────────────────────────────────────────────────────
describe('getMangaById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches the correct manga detail endpoint', async () => {
    mockOkJson({ data: { id: 'manga-abc' } });
    await getMangaById('manga-abc');
    expect(calledUrl()).toContain('/manga/manga-abc');
  });

  it('includes cover_art, author, and artist in includes[]', async () => {
    mockOkJson({ data: { id: 'manga-abc' } });
    await getMangaById('manga-abc');
    expect(calledUrl()).toContain('includes%5B%5D=cover_art');
    expect(calledUrl()).toContain('includes%5B%5D=author');
    expect(calledUrl()).toContain('includes%5B%5D=artist');
  });

  it('returns the data object from the response', async () => {
    const manga = { id: 'manga-abc', type: 'manga', attributes: { title: { en: 'Frieren' } } };
    mockOkJson({ data: manga });
    const result = await getMangaById('manga-abc');
    expect(result).toEqual(manga);
  });

  it('throws on HTTP error', async () => {
    mockHttpError(404);
    await expect(getMangaById('bad-id')).rejects.toThrow('MangaDex error: 404');
  });
});

// ── API: getMangaTags ──────────────────────────────────────────────────────
describe('getMangaTags', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the /manga/tag endpoint', async () => {
    mockOkJson({ data: [] });
    await getMangaTags();
    expect(calledUrl()).toContain('/manga/tag');
  });

  it('filters results to genre group only', async () => {
    const tags = [
      { id: 't1', attributes: { group: 'genre', name: { en: 'Action' } } },
      { id: 't2', attributes: { group: 'theme', name: { en: 'School Life' } } },
      { id: 't3', attributes: { group: 'genre', name: { en: 'Romance' } } },
    ];
    mockOkJson({ data: tags });
    const result = await getMangaTags();
    expect(result).toHaveLength(2);
    expect(result.every(t => t.attributes.group === 'genre')).toBe(true);
  });

  it('returns empty array when data is absent', async () => {
    mockOkJson({});
    expect(await getMangaTags()).toEqual([]);
  });
});

// ── API: getMangaChapters ──────────────────────────────────────────────────
describe('getMangaChapters', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the correct feed endpoint for the manga', async () => {
    mockOkJson({ data: [], total: 0 });
    await getMangaChapters('manga-xyz');
    expect(calledUrl()).toContain('/manga/manga-xyz/feed');
  });

  it('filters to English translations and orders by chapter asc', async () => {
    mockOkJson({ data: [], total: 0 });
    await getMangaChapters('manga-xyz');
    expect(calledUrl()).toContain('translatedLanguage%5B%5D=en');
    expect(calledUrl()).toContain('order%5Bchapter%5D=asc');
  });

  it('returns data array and total from response', async () => {
    const chapters = [{ id: 'ch1' }, { id: 'ch2' }];
    mockOkJson({ data: chapters, total: 42 });
    const result = await getMangaChapters('manga-xyz');
    expect(result.data).toEqual(chapters);
    expect(result.total).toBe(42);
  });

  it('returns empty data and zero total when fields are absent', async () => {
    mockOkJson({});
    const result = await getMangaChapters('manga-xyz');
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('respects custom offset and limit', async () => {
    mockOkJson({ data: [], total: 0 });
    await getMangaChapters('manga-xyz', 50, 25);
    expect(calledUrl()).toContain('offset=50');
    expect(calledUrl()).toContain('limit=25');
  });

  it('throws on HTTP error', async () => {
    mockHttpError(500);
    await expect(getMangaChapters('bad-manga')).rejects.toThrow('MangaDex error: 500');
  });
});

// ── API: getChapterPages ───────────────────────────────────────────────────
describe('getChapterPages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the at-home/server endpoint for the chapter', async () => {
    mockOkJson({ baseUrl: 'https://cdn.mangadex.org', chapter: { hash: 'abc', data: [], dataSaver: [] } });
    await getChapterPages('chapter-123');
    expect(calledUrl()).toContain('/at-home/server/chapter-123');
  });

  it('returns baseUrl, hash, data, and dataSaver from response', async () => {
    const pages = ['page1.jpg', 'page2.jpg'];
    const saverPages = ['page1-small.jpg', 'page2-small.jpg'];
    mockOkJson({
      baseUrl: 'https://cdn.mangadex.org',
      chapter: { hash: 'hashvalue', data: pages, dataSaver: saverPages },
    });
    const result = await getChapterPages('chapter-123');
    expect(result.baseUrl).toBe('https://cdn.mangadex.org');
    expect(result.hash).toBe('hashvalue');
    expect(result.data).toEqual(pages);
    expect(result.dataSaver).toEqual(saverPages);
  });

  it('returns empty arrays for data and dataSaver when chapter fields are absent', async () => {
    mockOkJson({ baseUrl: 'https://cdn.mangadex.org', chapter: {} });
    const result = await getChapterPages('chapter-123');
    expect(result.data).toEqual([]);
    expect(result.dataSaver).toEqual([]);
  });

  it('throws on HTTP error', async () => {
    mockHttpError(404);
    await expect(getChapterPages('invalid-chapter')).rejects.toThrow('MangaDex error: 404');
  });
});
