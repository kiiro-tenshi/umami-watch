import { getAniListEpisodeSchedule } from './anilist';

describe('getAniListEpisodeSchedule', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('fetches episode airing timestamps', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          Page: {
            pageInfo: { hasNextPage: false },
            airingSchedules: [
              { episode: 1, airingAt: 1_767_225_600 },
              { episode: 2, airingAt: 1_768_089_600 },
            ],
          },
        },
      }),
    });

    await expect(getAniListEpisodeSchedule('123')).resolves.toEqual([
      { episode: 1, airingAt: 1_767_225_600 },
      { episode: 2, airingAt: 1_768_089_600 },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      'https://graphql.anilist.co',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('paginates long airing schedules', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { Page: {
          pageInfo: { hasNextPage: true },
          airingSchedules: [{ episode: 1, airingAt: 1_767_225_600 }],
        } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { Page: {
          pageInfo: { hasNextPage: false },
          airingSchedules: [{ episode: 51, airingAt: 1_810_396_800 }],
        } } }),
      });

    const schedule = await getAniListEpisodeSchedule(123);
    expect(schedule.map(item => item.episode)).toEqual([1, 51]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
