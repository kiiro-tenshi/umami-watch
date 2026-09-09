import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import movies from '../../routes/movies.js';

const app = express();
app.use('/sources', movies);

describe('movie/TV HLS sources', () => {
  it.each([
    ['type=movie&tmdbId=550', '/movie/550'],
    ['type=tv&tmdbId=1399&season=2&episode=3', '/tv/1399/2/3'],
    ['type=tv&tmdbId=1399&season=0&episode=1', '/tv/1399/0/1'],
  ])('returns a stable Worker-resolvable URL for %s', async (query, path) => {
    const response = await request(app).get('/sources/sources?' + query);
    expect(response.status).toBe(200);
    expect(response.body.sources[0].embedUrl).toBe('https://vixsrc.to' + path);
  });
  it.each(['type=anime&tmdbId=550', 'type=movie&tmdbId=../x', 'type=tv&tmdbId=1&episode=0', 'type=tv&tmdbId=1&season=-1'])('rejects invalid content: %s', async query => {
    expect((await request(app).get('/sources/sources?' + query)).status).toBe(400);
  });
});
