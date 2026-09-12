import { describe, expect, it } from 'vitest';
import { nextAiredEpisode, resumePosition } from './playbackProgress';
import { getContinueWatchingItems } from '../pages/homeContinueWatching';

describe('resume playback', () => {
  const item = { contentType: 'tv', seasonNum: 1, episodeNum: 2, position: 300, duration: 1800 };
  it('restores only the matching TV episode', () => {
    expect(resumePosition(item, 'tv', 1, 2)).toBe(300);
    expect(resumePosition(item, 'tv', 1, 3)).toBe(0);
    expect(resumePosition(item, 'tv', 2, 2)).toBe(0);
    expect(resumePosition(item, 'movie')).toBe(0);
  });
  it('restarts finished movies and rejects invalid progress', () => {
    expect(resumePosition({ position: 900, duration: 1000 }, 'movie')).toBe(900);
    expect(resumePosition({ position: 950, duration: 1000 }, 'movie')).toBe(0);
    expect(resumePosition({ position: Infinity, duration: 1000 }, 'movie')).toBe(0);
  });
});

describe('TV episode continuation', () => {
  const episodes = [
    { episode_number: 3, air_date: '2026-09-20' },
    { episode_number: 2, air_date: '2026-09-10' },
    { episode_number: 1, air_date: '2026-09-01' },
  ];
  it('selects the next aired episode and stops before unreleased episodes', () => {
    expect(nextAiredEpisode(episodes, 1, 2, '2026-09-12')).toMatchObject({ season: 2, episode: 2 });
    expect(nextAiredEpisode(episodes, 2, 2, '2026-09-12')).toBeNull();
    expect(nextAiredEpisode([{ episode_number: 1, air_date: null }], 0, 3)).toBeNull();
  });
  it('continues into the next season and suppresses stale legacy history', () => {
    const items = getContinueWatchingItems([
      { id: 'tv_7', contentType: 'tv', contentId: '7', position: 1000, duration: 1000, nextSeasonNum: 2, nextEpisodeNum: 1 },
      { id: '7', contentType: 'tv', contentId: '7', position: 500, duration: 1000 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].continueUrl).toBe('/watch?type=tv&tmdbId=7&season=2&episode=1');
    expect(items[0].progress).toBeNull();
  });
});
