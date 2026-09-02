import { describe, expect, it, vi } from 'vitest';
import { resolveAnimeStream } from './animeStreams.js';

function probeResult(source) {
  return { first: Promise.resolve(source), complete: Promise.resolve(source ? [source] : []), cancel: vi.fn() };
}

describe('resolveAnimeStream', () => {
  const anime = {
    idMal: 61240,
    title: { english: 'Though I Am an Inept Villainess', romaji: 'Futsutsuka na Akujo' },
  };

  it('uses AniNeko when the anime has no MAL mapping', async () => {
    const primary = { label: 'Primary', type: 'hls', url: 'https://worker.example/primary' };
    const backupSource = vi.fn();
    const result = await resolveAnimeStream({ ...anime, idMal: null }, 1, 'https://worker.example/', {
      search: vi.fn().mockResolvedValue({ shows: [{ slug: 'show', title: anime.title.english }] }),
      pick: shows => shows[0],
      primarySource: vi.fn().mockResolvedValue({ sources: [{}] }),
      backupSource,
      build: vi.fn().mockReturnValue([primary]),
      probe: vi.fn().mockReturnValue(probeResult(primary)),
    });

    expect(result.source).toBe(primary);
    expect(result.provider).toBe('anineko');
    expect(backupSource).not.toHaveBeenCalled();
  });

  it('prefers the multi-quality MAL-ID provider without searching AniNeko', async () => {
    const backup = { label: 'MegaVid', type: 'hls', url: 'https://worker.example/megavid' };
    const backupSource = vi.fn().mockResolvedValue({ provider: 'megavid', sources: [{}] });
    const search = vi.fn();
    const build = vi.fn().mockReturnValue([backup]);
    const result = await resolveAnimeStream(anime, 1, 'https://worker.example/', {
      search,
      backupSource,
      build,
      probe: vi.fn().mockReturnValue(probeResult(backup)),
    });

    expect(backupSource).toHaveBeenCalledWith(61240, 1);
    expect(result.source).toBe(backup);
    expect(result.provider).toBe('megavid');
    expect(search).not.toHaveBeenCalled();
  });

  it('falls back to AniNeko when MegaVid is unavailable', async () => {
    const primary = { label: 'AniNeko', type: 'hls', url: 'https://worker.example/anineko' };
    const search = vi.fn().mockResolvedValue({ shows: [{ slug: 'show', title: anime.title.english }] });
    const result = await resolveAnimeStream(anime, 1, 'https://worker.example/', {
      backupSource: vi.fn().mockRejectedValue(new Error('MegaVid unavailable')),
      search,
      pick: shows => shows[0],
      primarySource: vi.fn().mockResolvedValue({ sources: [{}] }),
      build: vi.fn().mockReturnValue([primary]),
      probe: vi.fn().mockReturnValue(probeResult(primary)),
    });

    expect(search).toHaveBeenCalledWith(anime.title.english);
    expect(result.source).toBe(primary);
    expect(result.provider).toBe('anineko');
  });

  it('shows a stable friendly error when both providers fail', async () => {
    await expect(resolveAnimeStream(anime, 1, 'https://worker.example/', {
      search: vi.fn().mockRejectedValue(new Error('522')),
      backupSource: vi.fn().mockRejectedValue(new Error('503')),
    })).rejects.toThrow('No working stream is available for this episode right now.');
  });
});
