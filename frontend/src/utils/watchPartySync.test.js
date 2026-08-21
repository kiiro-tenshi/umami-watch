import { describe, expect, it } from 'vitest';
import { canApplySyncPosition, reconcileRoomStream, shouldJoinRoomSocket } from './watchPartySync';

describe('reconcileRoomStream', () => {
  const streamUrl = 'https://worker.example/manifest.m3u8';

  it('does not request a player remount for the same reconnect stream', () => {
    expect(reconcileRoomStream(streamUrl, { streamUrl, streamType: 'hls' }))
      .toMatchObject({ streamChanged: false, streamUrl, activeIndex: 0 });
  });

  it('requests a remount when the host actually changes streams', () => {
    const nextUrl = 'https://worker.example/other.m3u8';
    expect(reconcileRoomStream(streamUrl, { streamUrl: nextUrl, streamType: 'hls' }))
      .toMatchObject({ streamChanged: true, streamUrl: nextUrl });
  });

  it('selects the active source and its subtitle tracks', () => {
    const tracks = [{ label: 'English', src: '/en.vtt' }];
    const sources = [
      { type: 'hls', url: 'https://worker.example/first.m3u8', tracks: [] },
      { type: 'hls', url: streamUrl, tracks },
    ];
    expect(reconcileRoomStream(null, { streamUrl, streamSources: sources }))
      .toMatchObject({ streamChanged: true, sources, activeIndex: 1, tracks });
  });
});

describe('shouldJoinRoomSocket', () => {
  it('joins once for each new Socket.IO connection id', () => {
    expect(shouldJoinRoomSocket(null, 'socket-1')).toBe(true);
    expect(shouldJoinRoomSocket('socket-1', 'socket-1')).toBe(false);
    expect(shouldJoinRoomSocket('socket-1', 'socket-2')).toBe(true);
  });
});

describe('canApplySyncPosition', () => {
  it('defers heartbeat seeks while the viewer is buffering', () => {
    expect(canApplySyncPosition({ media: { readyState: 2, seeking: false } })).toBe(false);
    expect(canApplySyncPosition({ media: { readyState: 4, seeking: true } })).toBe(false);
  });

  it('allows a single catch-up seek after playback can advance', () => {
    expect(canApplySyncPosition({ media: { readyState: 3, seeking: false } })).toBe(true);
    expect(canApplySyncPosition({ readyState: 4, seeking: false })).toBe(true);
  });
});
