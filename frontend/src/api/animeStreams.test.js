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

  it('uses the primary provider when it has a working HLS stream', async () => {
    const primary = { label: 'Primary', type: 'hls', url: 'https://worker.example/primary' };
    const backupSource = vi.fn();
    const result = await resolveAnimeStream(anime, 1, 'https://worker.example/', {
      search: vi.fn().mockResolvedValue({ shows: [{ slug: 'show', title: anime.title.english }] }),
      pick: shows => shows[0],
      primarySource: vi.fn().mockResolvedValue({ sources: [{}] }),
      backupSource,
      build: vi.fn().mockReturnValue([primary]),
      probe: vi.fn().mockReturnValue(probeResult(primary)),
    });

    expect(result.source).toBe(primary);
    expect(result.provider).toBe('primary');
    expect(backupSource).not.toHaveBeenCalled();
  });

  it('automatically uses the MAL-ID backup when the primary returns 503', async () => {
    const backup = { label: 'Backup HLS', type: 'hls', url: 'https://worker.example/backup' };
    const backupSource = vi.fn().mockResolvedValue({ provider: 'megavid', sources: [{}] });
    const build = vi.fn().mockReturnValue([backup]);
    const result = await resolveAnimeStream(anime, 1, 'https://worker.example/', {
      search: vi.fn().mockRejectedValue(Object.assign(new Error('unavailable'), { status: 503 })),
      backupSource,
      build,
      probe: vi.fn().mockReturnValue(probeResult(backup)),
    });

    expect(backupSource).toHaveBeenCalledWith(61240, 1);
    expect(result.source).toBe(backup);
    expect(result.provider).toBe('backup');
  });

  it('shows a stable friendly error when both providers fail', async () => {
    await expect(resolveAnimeStream(anime, 1, 'https://worker.example/', {
      search: vi.fn().mockRejectedValue(new Error('522')),
      backupSource: vi.fn().mockRejectedValue(new Error('503')),
    })).rejects.toThrow('No working stream is available for this episode right now.');
  });
});
