import { describe, expect, it } from 'vitest';
import { buildAnimeWatchUrl, findExactAnimeTitleMatch, getAnimeHistoryKey, normalizeAnimeSource } from './animeRouting';

describe('anime routing', () => {
  it('preserves an AniList identity and an existing watch-party room', () => {
    expect(buildAnimeWatchUrl({
      animeId: 21355,
      epNum: 1,
      roomId: 'room-123',
      animeSource: 'anilist',
    })).toBe('/watch?type=anime&kitsuId=21355&epNum=1&animeSource=anilist&roomId=room-123');
  });

  it('keeps legacy Kitsu URLs compact', () => {
    expect(buildAnimeWatchUrl({ animeId: 11209, epNum: 2, animeSource: 'kitsu' }))
      .toBe('/watch?type=anime&kitsuId=11209&epNum=2');
  });

  it('separates history keys for overlapping provider IDs', () => {
    expect(getAnimeHistoryKey(123, 1, 'anilist')).toBe('anime_anilist123_ep1');
    expect(getAnimeHistoryKey(123, 1, 'kitsu')).toBe('anime_kitsu123_ep1');
    expect(normalizeAnimeSource('unknown')).toBe('kitsu');
  });

  it('does not recover a title to a different season or spin-off', () => {
    const results = [
      { id: 'season-4', title: { english: 'Re:ZERO -Starting Life in Another World- Season 4' } },
      { id: 'base', title: { english: 'Re:ZERO -Starting Life in Another World-' } },
    ];
    expect(findExactAnimeTitleMatch(results, 'Re:ZERO Starting Life in Another World')).toEqual(results[1]);
    expect(findExactAnimeTitleMatch(results, 'Re:ZERO Memory Snow')).toBeNull();
  });
});
