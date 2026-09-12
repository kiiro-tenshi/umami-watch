import { beforeEach, describe, expect, it } from 'vitest';
import { clearLocalProgress, mergeLocalProgress, readPreference, writePreference } from './playerPreferences';

describe('player preferences and local progress', () => {
  beforeEach(() => localStorage.clear());

  it('preserves explicit off and rejects corrupted preferences', () => {
    writePreference('auto-next', false);
    expect(readPreference('auto-next', true)).toBe(false);
    localStorage.setItem('umami-captions', '{bad');
    expect(readPreference('captions', {})).toEqual({});
    localStorage.setItem('umami-captions', '[]');
    expect(readPreference('captions', {})).toEqual({});
  });

  it('uses the newest progress and keeps accounts separate', () => {
    writePreference('progress-user1-tv_7', { contentId: '7', position: 300, updatedAtMs: 20 });
    writePreference('progress-user2-movie_8', { contentId: '8', position: 400, updatedAtMs: 30 });
    const cloud = [{ id: 'tv_7', contentId: '7', position: 100, updatedAtMs: 10 }];
    expect(mergeLocalProgress('user1', cloud)).toEqual([{ id: 'tv_7', contentId: '7', position: 300, updatedAtMs: 20 }]);
    expect(mergeLocalProgress('user1', [{ ...cloud[0], position: 500, updatedAtMs: 40 }])[0].position).toBe(500);
  });

  it('clears local history without removing preferences or other accounts', () => {
    writePreference('progress-user1-tv_7', { contentId: '7', updatedAtMs: 20 });
    writePreference('progress-user2-tv_7', { contentId: '7', updatedAtMs: 20 });
    writePreference('auto-next', false);
    clearLocalProgress('user1');
    expect(mergeLocalProgress('user1', [])).toEqual([]);
    expect(mergeLocalProgress('user2', [])).toHaveLength(1);
    expect(readPreference('auto-next', true)).toBe(false);
  });
});
