import { describe, expect, it, vi } from 'vitest';
import { createMegaVidClient, normalizeMegaVidPayload } from '../../routes/megavid.js';

describe('MegaVid backup provider', () => {
  const payload = {
    status: 'ok',
    type: 'hls',
    source: 'https://cp.megavid.buzz/hls/show/playlist.m3u8',
    tracks: [
      { file: 'https://megavid.buzz/sub/show/track_0_eng.vtt', label: 'English', default: true },
    ],
  };

  it('normalizes HLS and subtitle metadata without proxying video through the server', () => {
    expect(normalizeMegaVidPayload(payload)).toEqual({
      provider: 'megavid',
      sources: [{
        label: 'Backup HLS',
        hlsUrl: payload.source,
        referer: 'https://megavid.buzz/',
        tracks: [{
          kind: 'subtitles',
          label: 'English',
          srclang: 'en',
          src: payload.tracks[0].file,
          default: true,
        }],
      }],
    });
  });

  it('requests an episode by MAL ID and caches its metadata briefly', async () => {
    const fetchFn = vi.fn().mockResolvedValue(Response.json(payload));
    const client = createMegaVidClient({ fetchFn });

    await expect(client.getSources('61240', '1')).resolves.toMatchObject({ provider: 'megavid' });
    await expect(client.getSources('61240', '1')).resolves.toMatchObject({ provider: 'megavid' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe('https://megavid.buzz/mal/61240/1/sub/source?provider=1');
  });

  it('falls back to the default provider route when the HD route fails', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(Response.json(payload));
    const client = createMegaVidClient({ fetchFn });

    await expect(client.getSources('61240', '1')).resolves.toMatchObject({ provider: 'megavid' });
    expect(fetchFn.mock.calls.map(call => call[0])).toEqual([
      'https://megavid.buzz/mal/61240/1/sub/source?provider=1',
      'https://megavid.buzz/mal/61240/1/sub/source',
    ]);
  });

  it('rejects non-HLS responses', () => {
    expect(() => normalizeMegaVidPayload({ status: 'ok', type: 'mp4', source: 'https://example.com/video.mp4' }))
      .toThrow(/unsupported stream/i);
  });
});
