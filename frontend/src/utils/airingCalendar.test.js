import { prioritizeAiringSchedules } from './airingCalendar';

function schedule(id, title, popularity) {
  return {
    airingAt: 1_772_323_200,
    episode: 2,
    media: { id, title: { english: title, romaji: null }, popularity },
  };
}

describe('prioritizeAiringSchedules', () => {
  it('pins AniList history matches before more popular anime', () => {
    const result = prioritizeAiringSchedules(
      [schedule(1, 'Popular', 1000), schedule(2, 'Watching', 10)],
      [{ contentType: 'anime', contentSource: 'anilist', contentId: '2', title: 'Watching' }]
    );

    expect(result.map(item => item.media.id)).toEqual([2, 1]);
    expect(result[0].isCurrentlyWatching).toBe(true);
  });

  it('matches Kitsu and legacy history by normalized title', () => {
    const result = prioritizeAiringSchedules(
      [schedule(10, 'Re:ZERO -Starting Life in Another World-', 100)],
      [{
        contentType: 'anime',
        contentSource: 'kitsu',
        contentId: '99',
        title: 'Re:ZERO Starting Life in Another World — Episode 4',
      }]
    );

    expect(result[0].isCurrentlyWatching).toBe(true);
  });

  it('keeps the calendar compact at five entries', () => {
    const schedules = Array.from({ length: 8 }, (_, index) =>
      schedule(index + 1, `Anime ${index + 1}`, index)
    );

    expect(prioritizeAiringSchedules(schedules, [])).toHaveLength(5);
  });
});
