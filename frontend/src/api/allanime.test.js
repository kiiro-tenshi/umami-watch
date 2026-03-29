import { describe, it, expect } from 'vitest';
import { pickBestShow } from './allanime.js';

// Simulates the AllAnime search results for shows that share a base title
const FRIEREN_SHOWS = [
  { _id: 'qpeexkeTa7DzLjRnp', name: 'Sousou no Frieren Season 2', englishName: 'Frieren: Beyond Journey\'s End Season 2' },
  { _id: 'sG52nbcFo3PfLg6PD', name: 'Sousou no Frieren: no Mahou', englishName: 'Frieren: Beyond Journey\'s End Mini Anime' },
  { _id: 'mKdCCBKYRZ6ygF2co', name: 'Sousou no Frieren no Mahou Part 2', englishName: null },
  { _id: 'ReHMC7TQnch3C6z8j', name: 'Sousou no Frieren', englishName: 'Frieren: Beyond Journey\'s End' },
];

const OSHI_SHOWS = [
  { _id: 'inBARBpQC24H7Z6bE', name: 'Oshi No Ko Season 3', englishName: '[Oshi No Ko] Season 3' },
  { _id: 'pxoBGA54cmpk56MLA', name: 'Oshi No Ko Season 2', englishName: '[Oshi No Ko] Season 2' },
  { _id: 'b3u5TprKSKHBPBcor', name: 'Oshi No Ko', englishName: '[Oshi No Ko]' },
];

describe('pickBestShow', () => {
  it('returns null for empty list', () => {
    expect(pickBestShow([], 'Naruto')).toBeNull();
    expect(pickBestShow(null, 'Naruto')).toBeNull();
  });

  it('Frieren S1 — picks base show over Season 2', () => {
    const result = pickBestShow(FRIEREN_SHOWS, "Frieren: Beyond Journey's End");
    expect(result._id).toBe('ReHMC7TQnch3C6z8j');
  });

  it('Oshi no Ko S1 — picks base show over Season 2 and 3', () => {
    const result = pickBestShow(OSHI_SHOWS, 'Oshi no Ko');
    expect(result._id).toBe('b3u5TprKSKHBPBcor');
  });

  it('Oshi no Ko S2 — picks Season 2 specifically', () => {
    const result = pickBestShow(OSHI_SHOWS, 'Oshi no Ko Season 2');
    expect(result._id).toBe('pxoBGA54cmpk56MLA');
  });

  it('Oshi no Ko S3 — picks Season 3 specifically', () => {
    const result = pickBestShow(OSHI_SHOWS, 'Oshi no Ko Season 3');
    expect(result._id).toBe('inBARBpQC24H7Z6bE');
  });

  it('single result — returns it regardless of title match', () => {
    const only = [{ _id: 'abc', name: 'Something', englishName: 'Something' }];
    expect(pickBestShow(only, 'Anything')).toBe(only[0]);
  });

  it('ignores punctuation differences in matching', () => {
    // Kitsu may return "Frieren Beyond Journeys End" (no apostrophe)
    const result = pickBestShow(FRIEREN_SHOWS, 'Frieren Beyond Journeys End');
    expect(result._id).toBe('ReHMC7TQnch3C6z8j');
  });
});
