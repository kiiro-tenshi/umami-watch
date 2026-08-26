import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../hooks/useWatchedEps', () => ({
  useWatchedEps: () => ({
    watchedEps: new Set(),
    toggleWatched: vi.fn(),
    markAllWatched: vi.fn(),
    markAllUnwatched: vi.fn(),
  }),
}));

import EpisodeList from './EpisodeList';

describe('EpisodeList release dates', () => {
  it('shows released and upcoming dates as DD/MM/YYYY beside each episode', () => {
    render(
      <MemoryRouter>
        <EpisodeList
          animeId="123"
          episodes={[
            { id: '1', number: 1, title: 'Episode 1', airdate: '2005-12-01' },
            { id: '2', number: 2, title: 'Episode 2', airdate: '2026-08-09' },
          ]}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('(01/12/2005)')).toBeInTheDocument();
    expect(screen.getByText('(09/08/2026)')).toBeInTheDocument();
    expect(screen.queryByText('Released')).not.toBeInTheDocument();
  });
});
