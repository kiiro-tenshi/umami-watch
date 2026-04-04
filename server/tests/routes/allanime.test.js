import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mock global fetch (used by gqlPost inside allanime.js) ─────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── App setup ──────────────────────────────────────────────────────────────
const { default: allAnimeRouter } = await import('../../routes/allanime.js');

const app = express();
app.use(express.json());
app.use('/', allAnimeRouter);

// ── Test helpers ───────────────────────────────────────────────────────────

/** Simulate a successful AllAnime GraphQL response. */
function mockGqlSuccess(data) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data }),
  });
}

/** Simulate a failed HTTP response from the AllAnime API. */
function mockGqlHttpError(status = 500) {
  mockFetch.mockResolvedValueOnce({ ok: false, status });
}

/** Simulate a GQL response containing errors. */
function mockGqlErrors(message = 'GraphQL error') {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ errors: [{ message }] }),
  });
}

/**
 * XOR-encode a plain URL the same way AllAnime encodes its source URLs:
 *   each character is XORed with 56 and emitted as two hex digits.
 * The server's decodeUrl() reverses this — so this helper lets tests feed
 * realistic encoded input without hard-coding fragile hex strings.
 */
function xorEncodeUrl(url) {
  return '--' + [...url].map(c => (c.charCodeAt(0) ^ 56).toString(16).padStart(2, '0')).join('');
}

// ── GET /search ────────────────────────────────────────────────────────────

describe('GET /search', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when q param is missing', async () => {
    const res = await request(app).get('/search');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'q required' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns shows array on success', async () => {
    const edges = [
      { _id: 'id-1', name: 'Naruto', englishName: 'Naruto', thumbnail: 'https://cdn/img.jpg' },
      { _id: 'id-2', name: 'Bleach', englishName: 'Bleach', thumbnail: 'https://cdn/img2.jpg' },
    ];
    mockGqlSuccess({ shows: { edges } });

    const res = await request(app).get('/search?q=Naruto');

    expect(res.status).toBe(200);
    expect(res.body.shows).toHaveLength(2);
    expect(res.body.shows[0]).toMatchObject({ _id: 'id-1', name: 'Naruto' });
  });

  it('returns 502 when AllAnime API returns a non-ok HTTP status', async () => {
    mockGqlHttpError(503);

    const res = await request(app).get('/search?q=Naruto');

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 502 when AllAnime API returns GraphQL errors', async () => {
    mockGqlErrors('Rate limited');

    const res = await request(app).get('/search?q=Naruto');

    expect(res.status).toBe(502);
    expect(res.body.error).toContain('Rate limited');
  });
});

// ── GET /show/:id ──────────────────────────────────────────────────────────

describe('GET /show/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns episode list with all expected fields', async () => {
    mockGqlSuccess({
      show: {
        _id: 'show-abc',
        name: 'Sousou no Frieren',
        englishName: "Frieren: Beyond Journey's End",
        availableEpisodesDetail: { sub: ['1', '2', '3'], dub: [] },
      },
    });

    const res = await request(app).get('/show/show-abc');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'show-abc',
      name: 'Sousou no Frieren',
      englishName: "Frieren: Beyond Journey's End",
      episodes: { sub: ['1', '2', '3'], dub: [] },
    });
  });

  it('returns empty episodes object when availableEpisodesDetail is null', async () => {
    mockGqlSuccess({
      show: { _id: 'show-xyz', name: 'Test', englishName: null, availableEpisodesDetail: null },
    });

    const res = await request(app).get('/show/show-xyz');

    expect(res.status).toBe(200);
    expect(res.body.episodes).toEqual({});
  });

  it('returns 502 when AllAnime API fails', async () => {
    mockGqlHttpError(502);

    const res = await request(app).get('/show/bad-id');

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
  });
});

// ── GET /sources ───────────────────────────────────────────────────────────

describe('GET /sources', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when showId param is missing', async () => {
    const res = await request(app).get('/sources?ep=1');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/showId/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 400 when ep param is missing', async () => {
    const res = await request(app).get('/sources?showId=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ep/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('decodes XOR-encoded source URLs', async () => {
    const realUrl = 'https://cdn.allanime.co/hls/1080p/ep1.m3u8';
    const encodedUrl = xorEncodeUrl(realUrl);

    mockGqlSuccess({
      episode: {
        sourceUrls: [{ sourceName: 'Luf-mp4', sourceUrl: encodedUrl, type: 'player', priority: 9 }],
      },
    });

    const res = await request(app).get('/sources?showId=abc&ep=1');

    expect(res.status).toBe(200);
    expect(res.body.sources).toHaveLength(1);
    expect(res.body.sources[0].url).toBe(realUrl);
  });

  it('passes through plain (non-encoded) https:// URLs unchanged', async () => {
    const plainUrl = 'https://stream.example.com/video.mp4';

    mockGqlSuccess({
      episode: {
        sourceUrls: [{ sourceName: 'Direct', sourceUrl: plainUrl, type: 'player', priority: 5 }],
      },
    });

    const res = await request(app).get('/sources?showId=abc&ep=1');

    expect(res.status).toBe(200);
    expect(res.body.sources[0].url).toBe(plainUrl);
  });

  it('filters out /apivtwo internal URLs', async () => {
    const internalUrl = xorEncodeUrl('/apivtwo/clock?id=abc');
    const validUrl = 'https://cdn.example.com/video.mp4';

    mockGqlSuccess({
      episode: {
        sourceUrls: [
          { sourceName: 'Internal', sourceUrl: internalUrl, type: 'player', priority: 10 },
          { sourceName: 'Valid',    sourceUrl: validUrl,    type: 'player', priority: 5 },
        ],
      },
    });

    const res = await request(app).get('/sources?showId=abc&ep=1');

    expect(res.body.sources).toHaveLength(1);
    expect(res.body.sources[0].url).toBe(validUrl);
  });

  it('filters out URLs that are neither https:// nor //', async () => {
    const relativeUrl = '/path/to/video.mp4';  // no protocol prefix

    mockGqlSuccess({
      episode: {
        sourceUrls: [
          { sourceName: 'Relative', sourceUrl: relativeUrl, type: 'player', priority: 5 },
          { sourceName: 'Valid',    sourceUrl: 'https://ok.com/v.mp4', type: 'iframe', priority: 3 },
        ],
      },
    });

    const res = await request(app).get('/sources?showId=abc&ep=1');

    expect(res.body.sources).toHaveLength(1);
    expect(res.body.sources[0].url).toBe('https://ok.com/v.mp4');
  });

  it('keeps protocol-relative // URLs', async () => {
    const protoRelUrl = '//cdn.example.com/embed.html';

    mockGqlSuccess({
      episode: {
        sourceUrls: [{ sourceName: 'Embed', sourceUrl: protoRelUrl, type: 'iframe', priority: 4 }],
      },
    });

    const res = await request(app).get('/sources?showId=abc&ep=1');

    expect(res.body.sources).toHaveLength(1);
    expect(res.body.sources[0].url).toBe(protoRelUrl);
  });

  it('maps player type to direct', async () => {
    mockGqlSuccess({
      episode: {
        sourceUrls: [{ sourceName: 'Yt-mp4', sourceUrl: 'https://cdn.example.com/v.mp4', type: 'player', priority: 1 }],
      },
    });

    const res = await request(app).get('/sources?showId=abc&ep=1');

    expect(res.body.sources[0].type).toBe('direct');
  });

  it('maps all non-player types to iframe', async () => {
    mockGqlSuccess({
      episode: {
        sourceUrls: [
          { sourceName: 'Embed1', sourceUrl: 'https://iframe.example.com/1', type: 'iframe', priority: 2 },
          { sourceName: 'Embed2', sourceUrl: 'https://iframe.example.com/2', type: 'embed', priority: 1 },
        ],
      },
    });

    const res = await request(app).get('/sources?showId=abc&ep=1');

    expect(res.body.sources.every(s => s.type === 'iframe')).toBe(true);
  });

  it('sorts sources by priority descending', async () => {
    mockGqlSuccess({
      episode: {
        sourceUrls: [
          { sourceName: 'Low',  sourceUrl: 'https://example.com/low.mp4',  type: 'player', priority: 1 },
          { sourceName: 'High', sourceUrl: 'https://example.com/high.mp4', type: 'player', priority: 9 },
          { sourceName: 'Mid',  sourceUrl: 'https://example.com/mid.mp4',  type: 'player', priority: 5 },
        ],
      },
    });

    const res = await request(app).get('/sources?showId=abc&ep=1');

    const priorities = res.body.sources.map(s => s.priority);
    expect(priorities).toEqual([9, 5, 1]);
  });

  it('defaults type param to sub', async () => {
    mockGqlSuccess({ episode: { sourceUrls: [] } });

    await request(app).get('/sources?showId=abc&ep=1');

    // Verify the GQL query used 'sub' as the translation type
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.variables.t).toBe('sub');
  });

  it('returns empty sources array when episode has no sourceUrls', async () => {
    mockGqlSuccess({ episode: { sourceUrls: null } });

    const res = await request(app).get('/sources?showId=abc&ep=1');

    expect(res.status).toBe(200);
    expect(res.body.sources).toEqual([]);
  });

  it('returns 502 when AllAnime API fails', async () => {
    mockGqlHttpError(503);

    const res = await request(app).get('/sources?showId=abc&ep=1');

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
  });
});
