import { describe, expect, it } from 'vitest';
import {
  getContinueWatchingItems,
  isHistoryItemComplete,
} from './homeContinueWatching';

describe('isHistoryItemComplete', () => {
  it('treats 85% playback as complete', () => {
    expect(isHistoryItemComplete({ position: 850, duration: 1000 })).toBe(true);
    expect(isHistoryItemComplete({ position: 849, duration: 1000 })).toBe(false);
  });

  it('honors manual watched overrides', () => {
    expect(isHistoryItemComplete({
      manuallyWatched: true,
      position: 0,
      duration: 1000,
    })).toBe(true);
    expect(isHistoryItemComplete({
      manuallyWatched: false,
      position: 1000,
      duration: 1000,
    })).toBe(false);
  });
});

describe('getContinueWatchingItems', () => {
  it('keeps the most recent entry for each anime and resumes a partial episode', () => {
    const items = getContinueWatchingItems([
      {
        id: 'anime-5',
        contentId: '123',
        contentType: 'anime',
        epNum: 5,
        position: 300,
        duration: 1200,
      },
      {
        id: 'anime-4',
        contentId: '123',
        contentType: 'anime',
        epNum: 4,
        position: 1200,
        duration: 1200,
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'anime-5',
      progress: 25,
      continueUrl: '/watch?type=anime&kitsuId=123&epNum=5',
    });
  });

  it('keeps a completed anime visible and continues with its next episode', () => {
    const [item] = getContinueWatchingItems([{
      id: 'anime-5',
      contentId: '123',
      contentType: 'anime',
      epNum: 5,
      position: 1100,
      duration: 1200,
    }]);

    expect(item.progress).toBeNull();
    expect(item.continueUrl).toBe('/watch?type=anime&kitsuId=123&epNum=6');
  });

  it('keeps ordering while hiding completed movies', () => {
    const items = getContinueWatchingItems([
      {
        id: 'movie-complete',
        contentId: '10',
        contentType: 'movie',
        position: 900,
        duration: 1000,
      },
      {
        id: 'anime-recent',
        contentId: '20',
        contentType: 'anime',
        epNum: 2,
        manuallyWatched: true,
      },
      {
        id: 'movie-partial',
        contentId: '30',
        contentType: 'movie',
        position: 100,
        duration: 1000,
      },
    ]);

    expect(items.map(item => item.id)).toEqual(['anime-recent', 'movie-partial']);
    expect(items[0].continueUrl).toBe('/watch?type=anime&kitsuId=20&epNum=3');
  });
});
