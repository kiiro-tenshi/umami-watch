import { describe, it, expect } from 'vitest';
import { pickBestShow } from './gogoanime.js';

const FRIEREN_SHOWS = [
  { slug: 'sousou-no-frieren-season-2', title: 'Frieren: Beyond Journey\'s End Season 2' },
  { slug: 'sousou-no-frieren-mini', title: 'Frieren: Beyond Journey\'s End Mini Anime' },
  { slug: 'sousou-no-frieren-mini-2', title: 'Sousou no Frieren no Mahou Part 2' },
  { slug: 'sousou-no-frieren', title: 'Frieren: Beyond Journey\'s End' },
];

const OSHI_SHOWS = [
  { slug: 'oshi-no-ko-season-3', title: '[Oshi No Ko] Season 3' },
  { slug: 'oshi-no-ko-season-2', title: '[Oshi No Ko] Season 2' },
  { slug: 'oshi-no-ko', title: '[Oshi No Ko]' },
];

describe('pickBestShow', () => {
  it('returns null for empty list', () => {
    expect(pickBestShow([], 'Naruto')).toBeNull();
    expect(pickBestShow(null, 'Naruto')).toBeNull();
  });

  it('Frieren S1 — picks base show over Season 2', () => {
    const result = pickBestShow(FRIEREN_SHOWS, "Frieren: Beyond Journey's End");
    expect(result.slug).toBe('sousou-no-frieren');
  });

  it('Oshi no Ko S1 — picks base show over Season 2 and 3', () => {
    const result = pickBestShow(OSHI_SHOWS, 'Oshi no Ko');
    expect(result.slug).toBe('oshi-no-ko');
  });

  it('Oshi no Ko S2 — picks Season 2 specifically', () => {
    const result = pickBestShow(OSHI_SHOWS, 'Oshi no Ko Season 2');
    expect(result.slug).toBe('oshi-no-ko-season-2');
  });

  it('Oshi no Ko S3 — picks Season 3 specifically', () => {
    const result = pickBestShow(OSHI_SHOWS, 'Oshi no Ko Season 3');
    expect(result.slug).toBe('oshi-no-ko-season-3');
  });

  it('single result — returns it regardless of title match', () => {
    const only = [{ slug: 'something', title: 'Something' }];
    expect(pickBestShow(only, 'Anything')).toBe(only[0]);
  });

  it('ignores punctuation differences in matching', () => {
    const result = pickBestShow(FRIEREN_SHOWS, 'Frieren Beyond Journeys End');
    expect(result.slug).toBe('sousou-no-frieren');
  });
});
