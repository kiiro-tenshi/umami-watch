import { buildAniListEpisodes, formatEpisodeDate } from './episodeDates';

describe('formatEpisodeDate', () => {
  it('formats provider calendar dates as DD/MM/YYYY', () => {
    expect(formatEpisodeDate('2005-12-01')).toBe('01/12/2005');
    expect(formatEpisodeDate('2026-08-09')).toBe('09/08/2026');
  });

  it('hides missing or invalid dates', () => {
    expect(formatEpisodeDate(null)).toBe('');
    expect(formatEpisodeDate('unknown')).toBe('');
  });
});

describe('buildAniListEpisodes', () => {
  it('merges released and upcoming schedules into episode stubs', () => {
    const episodes = buildAniListEpisodes(
      { episodes: 3 },
      [
        { episode: 1, airingAt: 1_767_225_600 },
        { episode: 3, airingAt: 1_768_953_600 },
      ]
    );

    expect(episodes).toHaveLength(3);
    expect(episodes[0].airdate).toBe(new Date(1_767_225_600_000).toISOString());
    expect(episodes[1].airdate).toBeNull();
    expect(episodes[2].airdate).toBe(new Date(1_768_953_600_000).toISOString());
  });

  it('uses the schedule count when an ongoing anime has no final episode count', () => {
    const episodes = buildAniListEpisodes(
      { episodes: null, nextAiringEpisode: { episode: 4 } },
      [{ episode: 4, airingAt: 1_768_953_600 }]
    );
    expect(episodes).toHaveLength(4);
  });
});
