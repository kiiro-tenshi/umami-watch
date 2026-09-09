import { describe, it, expect, vi } from 'vitest';
import { findMovieSubtitles } from './movieSubtitles.js';
import { srtToVtt } from '../../../cloudflare-worker/hls-proxy.js';

const srt = '1\r\n00:00:01,000 --> 00:00:03,500\r\n<i>Hello</i><img src=x onerror=alert(1)>\r\n';
describe('automatic movie subtitles', () => {
  it('converts SRT timestamps and strips untrusted HTML', () => {
    expect(srtToVtt(srt)).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nHello\n\n');
    expect(() => srtToVtt('<html>Error</html>')).toThrow();
  });
  it('looks up the exact TV episode and downloads captions only through the Worker', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ imdb_id: 'tt12345' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ subtitles: [
        { lang: 'eng', subtitleFileName: 'episode.srt', url: 'https://subs5.strem.io/file/1' },
        { lang: 'eng', subtitleFileName: 'unsafe.srt', url: 'https://other.example/file' },
      ] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => srt });
    const tracks = await findMovieSubtitles({ type: 'tv', tmdbId: 1, season: 2, episode: 3 }, 'https://worker.example/', fetch);
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get('url')).toContain('/series/tt12345:2:3.json');
    expect(new URL(tracks[0].src).origin).toBe('https://worker.example');
    expect(tracks).toHaveLength(1);
    expect(new URL(tracks[0].src).searchParams.get('subtitle')).toBe('1');
  });
  it('returns no tracks on provider failure without breaking playback', async () => {
    expect(await findMovieSubtitles({ type: 'movie', tmdbId: 550 }, 'https://worker.example/', vi.fn().mockRejectedValue(new Error('offline')))).toEqual([]);
  });
});
