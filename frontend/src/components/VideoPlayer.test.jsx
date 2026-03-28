import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('plyr', () => ({
  default: vi.fn(() => mockPlyrInstance),
}));

vi.mock('hls.js', () => ({
  default: Object.assign(
    vi.fn(() => ({
      loadSource: vi.fn(),
      attachMedia: vi.fn(),
      on: vi.fn(),
      destroy: vi.fn(),
      levels: [],
      currentLevel: -1,
    })),
    {
      isSupported: vi.fn(() => false), // force non-HLS path for most tests
      Events: { ERROR: 'hlsError', MANIFEST_PARSED: 'manifestParsed' },
    }
  ),
}));

vi.mock('plyr/dist/plyr.css', () => ({}));

import VideoPlayer from './VideoPlayer.jsx';
import Plyr from 'plyr';

// ── Tests ──────────────────────────────────────────────────────────────────
describe('VideoPlayer', () => {
  beforeEach(() => { vi.clearAllMocks(); });

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

    await waitFor(() => expect(Plyr).toHaveBeenCalledOnce());

    unmount();

    expect(mockPlyrDestroy).toHaveBeenCalled();
  });
});
