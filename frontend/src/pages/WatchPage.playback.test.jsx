import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { uid: 'viewer' },
  socket: { socketRef: { current: { on: () => {}, off: () => {}, emit: () => {} } }, connected: false },
  player: null,
  options: null,
  getDoc: vi.fn(),
  setDoc: vi.fn(async () => {}),
}));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../hooks/useSocket', () => ({ useSocket: () => mocks.socket }));
vi.mock('../hooks/useWatchedEps', () => ({ useWatchedEps: () => ({ watchedEps: new Set(), updateWatched: () => {} }) }));
vi.mock('../firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'token' } } }));
vi.mock('firebase/firestore', () => ({
  doc: (...parts) => parts.slice(1).join('/'), getDoc: mocks.getDoc, setDoc: mocks.setDoc, serverTimestamp: () => 'timestamp',
}));
vi.mock('../api/tmdb', () => ({
  getMovieDetail: async () => ({ title: 'Movie', poster_path: '/poster' }),
  getTVDetail: async () => ({ name: 'Series', number_of_seasons: 2, poster_path: '/poster' }),
  getTVSeason: async () => ({ episodes: [1, 2].map(number => ({ episode_number: number, name: `Episode ${number}`, air_date: '2020-01-01' })) }),
}));
vi.mock('../api/movieStreams', () => ({
  resolveMovieStream: async ({ season, episode }) => {
    const source = { url: `https://example.test/${season}/${episode}.m3u8`, type: 'hls', tracks: [] };
    return { source, sources: [source], cancel: () => {} };
  },
}));
vi.mock('../components/VideoPlayer', async () => {
  const { useEffect } = await import('react');
  return { default: ({ onReady, options }) => {
    mocks.options = options;
    useEffect(() => {
      const handlers = new Map();
      const player = {
        currentTime: 0, duration: 1000, paused: true,
        on: (name, fn) => handlers.set(name, fn),
        fire: name => handlers.get(name)?.(),
      };
      mocks.player = player;
      onReady(player);
    }, [options.sources[0]?.src]);
    return <div data-testid="player" />;
  } };
});

import WatchPage from './WatchPage';
function Location() { return <output data-testid="location">{useLocation().search}</output>; }
function open(url = '/watch?type=tv&tmdbId=7&season=1&episode=1') {
  return render(<MemoryRouter initialEntries={[url]}><WatchPage /><Location /></MemoryRouter>);
}

describe('watch-page playback features', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.player = null;
    mocks.getDoc.mockResolvedValue({ exists: () => false });
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('auto-plays the next season and saves the completed episode', async () => {
    open('/watch?type=tv&tmdbId=7&season=1&episode=2');
    await screen.findByTestId('player');
    await screen.findByRole('link', { name: /Next: S2 E1/ });
    act(() => { mocks.player.currentTime = 1000; mocks.player.fire('ended'); });
    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('season=2&episode=1'));
    await screen.findByTestId('player');
    expect(mocks.options.autoplay).toBe(true);
    expect(mocks.setDoc).toHaveBeenCalledWith('users/viewer/history/tv_7', expect.objectContaining({ episodeNum: '2', position: 1000 }), { merge: true });
  });

  it('persists auto-next off and stays on the current episode when ended', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByTestId('player');
    await user.click(screen.getByRole('checkbox', { name: 'Auto-play next episode' }));
    act(() => mocks.player.fire('ended'));
    expect(screen.getByTestId('location').textContent).toContain('season=1&episode=1');
    expect(JSON.parse(localStorage.getItem('umami-auto-next'))).toBe(false);
  });

  it('resumes a movie and saves its position on pause', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ contentType: 'movie', position: 300, duration: 1000 }) });
    open('/watch?type=movie&tmdbId=7');
    await waitFor(() => expect(mocks.player?.currentTime).toBe(300));
    act(() => { mocks.player.currentTime = 420; mocks.player.fire('pause'); });
    expect(mocks.setDoc).toHaveBeenCalledWith('users/viewer/history/movie_7', expect.objectContaining({ position: 420 }), { merge: true });
  });
});
