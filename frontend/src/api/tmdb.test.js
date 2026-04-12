import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock fetch ─────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  searchContent,
  getTrending,
  getMovieDetail,
  getTVDetail,
  getTVSeason,
  getGenres,
  discoverContent,
  tmdbImage,
} from './tmdb.js';

// ── Helpers ────────────────────────────────────────────────────────────────
function mockJson(data) {
  mockFetch.mockResolvedValueOnce({ json: async () => data });
}

/** Returns the URL string passed to the first fetch call. */
const calledUrl = () => mockFetch.mock.calls[0][0].toString();

describe('tmdbImage helper', () => {
  it('builds a w500 image URL by default', () => {
    expect(tmdbImage('/poster.jpg')).toBe('https://image.tmdb.org/t/p/w500/poster.jpg');
  });

  it('respects a custom size parameter', () => {
    expect(tmdbImage('/poster.jpg', 'original')).toBe('https://image.tmdb.org/t/p/original/poster.jpg');
    expect(tmdbImage('/poster.jpg', 'w200')).toBe('https://image.tmdb.org/t/p/w200/poster.jpg');
  });

  it('returns /placeholder.png when path is falsy', () => {
    expect(tmdbImage(null)).toBe('/placeholder.png');
    expect(tmdbImage('')).toBe('/placeholder.png');
    expect(tmdbImage(undefined)).toBe('/placeholder.png');
  });
});

describe('searchContent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the correct TMDB search endpoint', async () => {
    mockJson({ results: [] });
    await searchContent('Inception', 'movie');
    expect(calledUrl()).toContain('/search/movie');
  });

  it('includes the query term in the URL', async () => {
    mockJson({ results: [] });
    await searchContent('Breaking Bad', 'tv');
    expect(calledUrl()).toContain('query=Breaking+Bad');
  });

  it('returns the parsed JSON response', async () => {
    const payload = { results: [{ id: 1, title: 'Inception' }], total_results: 1 };
    mockJson(payload);
    const data = await searchContent('Inception', 'movie');
    expect(data).toEqual(payload);
  });
});

describe('getTrending', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to the week window', async () => {
    mockJson({ results: [] });
    await getTrending('movie');
    expect(calledUrl()).toContain('/trending/movie/week');
  });

  it('respects the day window parameter', async () => {
    mockJson({ results: [] });
    await getTrending('tv', 'day');
    expect(calledUrl()).toContain('/trending/tv/day');
  });

  it('supports anime (person) media type', async () => {
    mockJson({ results: [] });
    await getTrending('person');
    expect(calledUrl()).toContain('/trending/person/week');
  });
});

describe('getMovieDetail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches movie detail at the correct endpoint', async () => {
    mockJson({ id: 27205, title: 'Inception' });
    await getMovieDetail(27205);
    expect(calledUrl()).toContain('/movie/27205');
  });

  it('appends credits, videos, and external_ids via append_to_response', async () => {
    mockJson({ id: 27205 });
    await getMovieDetail(27205);
    expect(calledUrl()).toContain('append_to_response=credits%2Cvideos%2Cexternal_ids');
  });

  it('returns the parsed movie data', async () => {
    const movie = { id: 27205, title: 'Inception', runtime: 148 };
    mockJson(movie);
    const data = await getMovieDetail(27205);
    expect(data.title).toBe('Inception');
    expect(data.runtime).toBe(148);
  });
});

describe('getTVDetail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches TV detail at the correct endpoint', async () => {
    mockJson({ id: 1396, name: 'Breaking Bad' });
    await getTVDetail(1396);
    expect(calledUrl()).toContain('/tv/1396');
  });

  it('appends credits and videos via append_to_response', async () => {
    mockJson({ id: 1396 });
    await getTVDetail(1396);
    expect(calledUrl()).toContain('append_to_response');
  });

  it('returns the parsed TV show data', async () => {
    const show = { id: 1396, name: 'Breaking Bad', number_of_seasons: 5 };
    mockJson(show);
    const data = await getTVDetail(1396);
    expect(data.name).toBe('Breaking Bad');
  });
});

describe('getTVSeason', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches the correct season endpoint', async () => {
    mockJson({ season_number: 2, episodes: [] });
    await getTVSeason(1396, 2);
    expect(calledUrl()).toContain('/tv/1396/season/2');
  });
});

describe('getGenres', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches movie genres', async () => {
    mockJson({ genres: [{ id: 28, name: 'Action' }] });
    await getGenres('movie');
    expect(calledUrl()).toContain('/genre/movie/list');
  });

  it('fetches TV genres', async () => {
    mockJson({ genres: [{ id: 10759, name: 'Action & Adventure' }] });
    await getGenres('tv');
    expect(calledUrl()).toContain('/genre/tv/list');
  });

  it('returns genre list in parsed response', async () => {
    const genres = [{ id: 28, name: 'Action' }, { id: 12, name: 'Adventure' }];
    mockJson({ genres });
    const data = await getGenres('movie');
    expect(data.genres).toEqual(genres);
  });
});

describe('discoverContent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches the discover endpoint for the given type', async () => {
    mockJson({ results: [] });
    await discoverContent('movie', { with_genres: '28' });
    expect(calledUrl()).toContain('/discover/movie');
  });

  it('appends custom params to the URL', async () => {
    mockJson({ results: [] });
    await discoverContent('tv', { with_genres: '10759', sort_by: 'popularity.desc' });
    expect(calledUrl()).toContain('with_genres=10759');
    expect(calledUrl()).toContain('sort_by=popularity.desc');
  });
});
