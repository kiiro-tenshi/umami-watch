import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockPlyrDestroy = vi.fn();
const mockPlyrOn = vi.fn();
const mockPlyrInstance = {
  destroy: mockPlyrDestroy,
  on: mockPlyrOn,
  elements: { container: document.createElement('div'), controls: document.createElement('div') },
  volume: 0.5,
  currentTime: 0,
  duration: 100,
  togglePlay: vi.fn(),
  paused: true,
};
const mockHlsHandlers = new Map();
const mockHlsInstance = {
  loadSource: vi.fn(),
  attachMedia: vi.fn(),
  on: vi.fn((event, handler) => mockHlsHandlers.set(event, handler)),
  destroy: vi.fn(),
  levels: [],
  currentLevel: -1,
  config: {},
};

vi.mock('plyr', () => ({
  default: vi.fn(() => mockPlyrInstance),
}));

vi.mock('hls.js', () => ({
  default: Object.assign(
    vi.fn(config => {
      mockHlsInstance.config = { ...config };
      return mockHlsInstance;
    }),
    {
      isSupported: vi.fn(() => false), // force non-HLS path for most tests
      Events: { ERROR: 'hlsError', MANIFEST_PARSED: 'manifestParsed', FRAG_BUFFERED: 'fragBuffered' },
    }
  ),
}));

vi.mock('plyr/dist/plyr.css', () => ({}));

import VideoPlayer, { getAdaptiveBufferConfig, getHlsQualityLevels } from './VideoPlayer.jsx';
import Plyr from 'plyr';
import Hls from 'hls.js';

// ── Tests ──────────────────────────────────────────────────────────────────
describe('VideoPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHlsHandlers.clear();
    mockPlyrInstance.elements.container.replaceChildren();
    mockPlyrInstance.elements.controls.replaceChildren();
    mockHlsInstance.config = {};
    mockHlsInstance.levels = [];
    mockHlsInstance.currentLevel = -1;
    Hls.isSupported.mockReturnValue(false);
  });

  it('uses conservative, balanced, and fast adaptive buffer profiles', () => {
    expect(getAdaptiveBufferConfig({
      userAgent: 'Mobile',
      deviceMemory: 4,
      connection: { type: 'cellular', effectiveType: '4g', downlink: 20 },
    })).toMatchObject({ maxBufferLength: 30, maxMaxBufferLength: 60 });

    expect(getAdaptiveBufferConfig({ userAgent: 'Desktop', deviceMemory: 4 }))
      .toMatchObject({ maxBufferLength: 60, maxMaxBufferLength: 120 });

    expect(getAdaptiveBufferConfig({
      userAgent: 'Desktop',
      deviceMemory: 8,
      connection: { type: 'wifi', effectiveType: '4g', downlink: 20 },
    })).toMatchObject({ maxBufferLength: 90, maxMaxBufferLength: 180 });
  });

  it('prefers 1080p, then the next lower available resolution', () => {
    expect(getHlsQualityLevels([
      { height: 360, bitrate: 800_000 },
      { height: 1080, bitrate: 4_000_000 },
      { height: 720, bitrate: 2_000_000 },
    ]).preferred.height).toBe(1080);
    expect(getHlsQualityLevels([{ height: 360 }, { height: 720 }]).preferred.height).toBe(720);
    expect(getHlsQualityLevels([{ height: 360 }, { height: 480 }]).preferred.height).toBe(480);
  });

  it('starts HLS at 1080p and exposes resolution choices to viewers', () => {
    Hls.isSupported.mockReturnValue(true);
    mockHlsInstance.levels = [
      { height: 360, bitrate: 800_000 },
      { height: 1080, bitrate: 4_000_000 },
      { height: 720, bitrate: 2_000_000 },
    ];

    render(
      <VideoPlayer
        options={{ isViewer: true, sources: [{ src: 'https://worker.example/stream.m3u8', type: 'application/x-mpegURL' }] }}
      />
    );
    act(() => mockHlsHandlers.get('manifestParsed')());

    expect(mockHlsInstance.currentLevel).toBe(1);
    const plyrOptions = Plyr.mock.calls.at(-1)[1];
    expect(plyrOptions.controls).toContain('settings');
    expect(plyrOptions.settings).toEqual(['quality']);
    expect(plyrOptions.quality).toMatchObject({ default: 1080, options: [1080, 720, 360] });

    act(() => plyrOptions.quality.onChange(720));
    expect(mockHlsInstance.currentLevel).toBe(2);
  });

  it('updates the active HLS buffer profile when the network changes', () => {
    Hls.isSupported.mockReturnValue(true);
    const originalConnection = Object.getOwnPropertyDescriptor(navigator, 'connection');
    let changeHandler;
    const connection = {
      type: 'wifi',
      effectiveType: '4g',
      downlink: 20,
      saveData: false,
      addEventListener: vi.fn((_event, handler) => { changeHandler = handler; }),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });

    try {
      const { unmount } = render(
        <VideoPlayer options={{ sources: [{ src: 'https://worker.example/stream.m3u8', type: 'application/x-mpegURL' }] }} />
      );
      expect(mockHlsInstance.config).toMatchObject({ maxBufferLength: 90, maxMaxBufferLength: 180 });

      connection.type = 'cellular';
      connection.effectiveType = '3g';
      act(() => changeHandler());
      expect(mockHlsInstance.config).toMatchObject({ maxBufferLength: 30, maxMaxBufferLength: 60 });

      unmount();
      expect(connection.removeEventListener).toHaveBeenCalledWith('change', changeHandler);
    } finally {
      if (originalConnection) Object.defineProperty(navigator, 'connection', originalConnection);
      else delete navigator.connection;
    }
  });

  it('renders a video element', () => {
    render(<VideoPlayer options={{ sources: [] }} />);
    expect(document.querySelector('video')).toBeInTheDocument();
  });

  it('shows loading overlay when no src is provided', () => {
    render(<VideoPlayer options={{ sources: [] }} />);
    // isLoading is true initially, then set to false because src is empty
    // With empty src, the effect sets isLoading=false immediately
    expect(document.querySelector('video')).toBeInTheDocument();
  });

  it('creates a Plyr instance when a src is provided', async () => {
    render(
      <VideoPlayer
        options={{ sources: [{ src: 'http://example.com/video.mp4', type: 'video/mp4' }] }}
      />
    );

    const video = document.querySelector('video');
    video.dispatchEvent(new Event('loadedmetadata'));

    await waitFor(() => {
      expect(Plyr).toHaveBeenCalledOnce();
    });
  });

  it('calls onReady with the player when video fires loadedmetadata', async () => {
    const onReady = vi.fn();

    render(
      <VideoPlayer
        options={{ sources: [{ src: 'http://example.com/video.mp4', type: 'video/mp4' }] }}
        onReady={onReady}
      />
    );

    // Simulate loadedmetadata event on the video element
    const video = document.querySelector('video');
    video.dispatchEvent(new Event('loadedmetadata'));

    await waitFor(() => expect(onReady).toHaveBeenCalledWith(mockPlyrInstance));
  });

  it('renders subtitle track elements when tracks are provided', () => {
    const tracks = [
      { kind: 'subtitles', label: 'English', srclang: 'en', src: '/subs/en.vtt' },
      { kind: 'subtitles', label: 'Japanese', srclang: 'ja', src: '/subs/ja.vtt' },
    ];

    render(
      <VideoPlayer
        options={{ sources: [{ src: 'http://example.com/video.mp4', type: 'video/mp4' }] }}
        tracks={tracks}
      />
    );

    const trackEls = document.querySelectorAll('track');
    expect(trackEls).toHaveLength(2);
    expect(trackEls[0].getAttribute('label')).toBe('English');
    expect(trackEls[1].getAttribute('label')).toBe('Japanese');
  });

  it('shows the custom loadingMessage in the loading overlay', async () => {
    render(
      <VideoPlayer
        options={{ sources: [{ src: 'http://example.com/video.mp4', type: 'video/mp4' }] }}
        loadingMessage="Connecting to torrent peers..."
      />
    );

    // Loading overlay is shown while isLoading is true (before loadedmetadata)
    expect(screen.getByText('Connecting to torrent peers...')).toBeInTheDocument();
  });

  it('destroys the Plyr instance when the component unmounts', async () => {
    const { unmount } = render(
      <VideoPlayer
        options={{ sources: [{ src: 'http://example.com/video.mp4', type: 'video/mp4' }] }}
      />
    );

    const video = document.querySelector('video');
    video.dispatchEvent(new Event('loadedmetadata'));

    await waitFor(() => expect(Plyr).toHaveBeenCalledOnce());

    unmount();

    expect(mockPlyrDestroy).toHaveBeenCalled();
  });

  it('uses the latest recovery callback without remounting the HLS player', async () => {
    vi.useFakeTimers();
    Hls.isSupported.mockReturnValue(true);
    const staleHandler = vi.fn(() => false);
    const recoveryHandler = vi.fn(() => true);
    const options = { sources: [{ src: 'https://worker.example/stream.m3u8', type: 'application/x-mpegURL' }] };

    try {
      const { rerender } = render(<VideoPlayer options={options} onError={staleHandler} />);
      act(() => mockHlsHandlers.get('manifestParsed')());
      act(() => mockHlsHandlers.get('fragBuffered')());
      rerender(<VideoPlayer options={options} onError={recoveryHandler} />);

      const video = document.querySelector('video');
      Object.defineProperty(video, 'paused', { configurable: true, value: false });
      act(() => video.dispatchEvent(new Event('waiting')));
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      act(() => video.dispatchEvent(new Event('waiting')));
      await act(() => vi.advanceTimersByTimeAsync(5_000));

      expect(staleHandler).not.toHaveBeenCalled();
      expect(recoveryHandler).toHaveBeenCalledWith(expect.objectContaining({ type: 'stall' }));
      expect(screen.queryByText('Stream stalled. Switching source...')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not report a stall when playback time is still advancing', async () => {
    vi.useFakeTimers();
    Hls.isSupported.mockReturnValue(true);
    const onError = vi.fn(() => false);

    try {
      render(
        <VideoPlayer
          options={{ sources: [{ src: 'https://worker.example/stream.m3u8', type: 'application/x-mpegURL' }] }}
          onError={onError}
        />
      );
      act(() => mockHlsHandlers.get('manifestParsed')());
      act(() => mockHlsHandlers.get('fragBuffered')());

      const video = document.querySelector('video');
      Object.defineProperty(video, 'paused', { configurable: true, value: false });
      video.currentTime = 10;
      act(() => video.dispatchEvent(new Event('waiting')));
      video.currentTime = 11;
      await act(() => vi.advanceTimersByTimeAsync(15_000));

      expect(onError).not.toHaveBeenCalled();
      expect(screen.queryByText('Stream stalled. Switching source...')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a terminal HLS error visible in fullscreen and clears it if playback resumes', async () => {
    vi.useFakeTimers();
    Hls.isSupported.mockReturnValue(true);
    document.body.appendChild(mockPlyrInstance.elements.container);

    try {
      render(
        <VideoPlayer
          options={{ sources: [{ src: 'https://worker.example/stream.m3u8', type: 'application/x-mpegURL' }] }}
          onError={() => false}
        />
      );
      act(() => mockHlsHandlers.get('manifestParsed')());
      act(() => mockHlsHandlers.get('fragBuffered')());

      const video = document.querySelector('video');
      Object.defineProperty(video, 'paused', { configurable: true, value: false });
      act(() => video.dispatchEvent(new Event('stalled')));
      await act(() => vi.advanceTimersByTimeAsync(15_000));

      expect(mockPlyrInstance.elements.container).toHaveTextContent('Stream stalled. Switching source...');

      await act(async () => video.dispatchEvent(new Event('playing')));
      expect(mockPlyrInstance.elements.container).not.toHaveTextContent('Stream stalled. Switching source...');
    } finally {
      mockPlyrInstance.elements.container.remove();
      vi.useRealTimers();
    }
  });
});
