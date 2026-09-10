import { describe, expect, it, vi } from 'vitest';
import { MAX_VERIFIED_ANIME_SOURCES, resolveAnimeStream } from './animeStreams.js';

function source(provider, id, working = true) {
  return {
    label: `${provider} ${id}`,
    type: 'hls',
    url: `https://worker.example/${provider}/${id}`,
    working,
  };
}

function probingOnlyWorkingSources() {
  return vi.fn((sources, _fetchFn, maxSources) => {
    const verified = sources.filter(item => item.working !== false).slice(0, maxSources);
    return {
      first: Promise.resolve(verified[0] || null),
      complete: Promise.resolve(verified),
      cancel: vi.fn(),
    };
  });
}

function aniNekoDependencies(sources, overrides = {}) {
  return {
    search: vi.fn().mockResolvedValue({ shows: [{ slug: 'show', title: 'Though I Am an Inept Villainess' }] }),
    pick: shows => shows[0],
    primarySource: vi.fn().mockResolvedValue({ sources }),
    build: data => data.sources,
    probe: probingOnlyWorkingSources(),
    ...overrides,
  };
}

describe('resolveAnimeStream', () => {
  const anime = {
    idMal: 61240,
    title: { english: 'Though I Am an Inept Villainess', romaji: 'Futsutsuka na Akujo' },
  };

  it('uses verified AniNeko sources when the anime has no MAL mapping', async () => {
    const aniSource = source('anineko', 1);
    const backupSource = vi.fn();
    const dependencies = aniNekoDependencies([aniSource], { backupSource });
    const result = await resolveAnimeStream(
      { ...anime, idMal: null },
      1,
      'https://worker.example/',
      dependencies,
    );

    expect(result.source).toMatchObject({
      url: aniSource.url,
      provider: 'anineko',
      label: 'AniNeko - anineko 1',
    });
    expect(result.provider).toBe('anineko');
    expect(await result.complete).toHaveLength(1);
    expect(backupSource).not.toHaveBeenCalled();
    expect(dependencies.probe).toHaveBeenCalledWith(
      expect.any(Array),
      undefined,
      MAX_VERIFIED_ANIME_SOURCES,
    );
  });

  it('keeps same-episode captions when primary video mirrors fail', async () => {
    const tracks = [{ kind: 'captions', label: 'English', src: 'https://worker.example/?url=subtitle.vtt' }];
    const dependencies = aniNekoDependencies([
      { ...source('anineko', 1, false), tracks },
    ], { backupSource: vi.fn().mockResolvedValue({ sources: [source('megavid', 1)] }) });
    const result = await resolveAnimeStream(anime, 9, 'https://worker.example/', dependencies);
    expect(result.source.tracks).toEqual(tracks);
    expect(await result.complete).toHaveLength(1);
    expect(dependencies.primarySource).toHaveBeenCalledWith('show', 9);
  });

  it('prefers MegaVid but also adds verified AniNeko mirrors', async () => {
    const megaVid = source('megavid', 1);
    const aniSources = [source('anineko', 1), source('anineko', 2)];
    const backupSource = vi.fn().mockResolvedValue({ sources: [megaVid] });
    const dependencies = aniNekoDependencies(aniSources, { backupSource });

    const result = await resolveAnimeStream(anime, 1, 'https://worker.example/', dependencies);
    const complete = await result.complete;

    expect(backupSource).toHaveBeenCalledWith(61240, 1, 'sub');
    expect(dependencies.search).toHaveBeenCalledWith(anime.title.english);
    expect(result.source).toMatchObject({ url: megaVid.url, provider: 'megavid' });
    expect(complete.map(item => item.url)).toEqual([
      megaVid.url,
      aniSources[0].url,
      aniSources[1].url,
    ]);
    expect(complete.map(item => item.label)).toEqual([
      'MegaVid - megavid 1',
      'AniNeko - anineko 1',
      'AniNeko - anineko 2',
    ]);
  });

  it('uses an already-running AniNeko check when MegaVid is unavailable', async () => {
    const aniSource = source('anineko', 1);
    const dependencies = aniNekoDependencies([aniSource], {
      backupSource: vi.fn().mockRejectedValue(new Error('MegaVid unavailable')),
    });

    const result = await resolveAnimeStream(anime, 1, 'https://worker.example/', dependencies);

    expect(result.source).toMatchObject({ url: aniSource.url, provider: 'anineko' });
    expect(result.provider).toBe('anineko');
  });

  it('shows no more than five sources and excludes failed probes', async () => {
    const megaVid = source('megavid', 1);
    const aniSources = [
      source('anineko', 1, false),
      source('anineko', 2),
      source('anineko', 3),
      source('anineko', 4),
      source('anineko', 5),
      source('anineko', 6),
    ];
    const dependencies = aniNekoDependencies(aniSources, {
      backupSource: vi.fn().mockResolvedValue({ sources: [megaVid] }),
    });

    const result = await resolveAnimeStream(anime, 1, 'https://worker.example/', dependencies);
    const complete = await result.complete;

    expect(complete).toHaveLength(MAX_VERIFIED_ANIME_SOURCES);
    expect(complete.every(item => item.working)).toBe(true);
    expect(complete.some(item => item.url === aniSources[0].url)).toBe(false);
  });

  it('shows a stable friendly error when both providers fail', async () => {
    await expect(resolveAnimeStream(anime, 1, 'https://worker.example/', {
      search: vi.fn().mockRejectedValue(new Error('522')),
      backupSource: vi.fn().mockRejectedValue(new Error('503')),
    })).rejects.toThrow('No working stream is available for this episode right now.');
  });
});
