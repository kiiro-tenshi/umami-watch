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

const DUB_MIXED_SHOWS = [
  { slug: 'naruto-dub', title: 'Naruto (Dub)' },
  { slug: 'naruto', title: 'Naruto' },
  { slug: 'naruto-shippuden-dub', title: 'Naruto: Shippuden (Dub)' },
];

describe('pickBestShow', () => {
  it('returns null for empty list', () => {
    expect(pickBestShow([], 'Naruto')).toBeNull();
    expect(pickBestShow(null, 'Naruto')).toBeNull();
  });

  it('returns null when no show has a meaningful match (avoids returning wrong anime)', () => {
    const unrelated = [
      { slug: 'dragon-ball-z', title: 'Dragon Ball Z' },
      { slug: 'one-piece', title: 'One Piece' },
    ];
    expect(pickBestShow(unrelated, 'Naruto')).toBeNull();
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

  it('ignores punctuation differences in matching', () => {
    const result = pickBestShow(FRIEREN_SHOWS, 'Frieren Beyond Journeys End');
    expect(result.slug).toBe('sousou-no-frieren');
  });

  // Compact match: AniList may store a title as one concatenated word (e.g. "MARRIAGETOXIN")
  // while GogoAnime indexes it with spaces ("Marriage Toxin"). Strip spaces from both and compare.
  it('compact match — "MARRIAGETOXIN" matches "Marriage Toxin"', () => {
    const shows = [
      { slug: 'some-romance-show', title: 'My Lovely Marriage' },
      { slug: 'marriage-toxin', title: 'Marriage Toxin' },
    ];
    expect(pickBestShow(shows, 'MARRIAGETOXIN').slug).toBe('marriage-toxin');
  });

  it('compact match — "MARRIAGETOXIN" beats unrelated show even when listed first', () => {
    const shows = [
      { slug: 'random-show', title: 'Random Show' },
      { slug: 'marriage-toxin', title: 'Marriage Toxin' },
    ];
    expect(pickBestShow(shows, 'MARRIAGETOXIN').slug).toBe('marriage-toxin');
  });

  it('prefers sub over dub when titles otherwise match equally', () => {
    const result = pickBestShow(DUB_MIXED_SHOWS, 'Naruto');
    expect(result.slug).toBe('naruto');
  });

  it('skips dub even when dub slug appears first in results', () => {
    const reversed = [...DUB_MIXED_SHOWS].reverse();
    const result = pickBestShow(reversed, 'Naruto');
    expect(result.slug).toBe('naruto');
  });

  it('returns null for dub-only list — caller should try romaji fallback', () => {
    const dubOnly = [{ slug: 'one-piece-dub', title: 'One Piece (Dub)' }];
    expect(pickBestShow(dubOnly, 'One Piece')).toBeNull();
  });

  it('returns match even when extra words in result title push score negative', () => {
    // "Overlord" matches "Overlord IV: The Half-Elf Demihuman" even though extraWords penalty > matchCount
    const shows = [{ slug: 'overlord-iv', title: 'Overlord IV: The Half-Elf Demihuman' }];
    expect(pickBestShow(shows, 'Overlord IV')).not.toBeNull();
    expect(pickBestShow(shows, 'Overlord IV').slug).toBe('overlord-iv');
  });
});
