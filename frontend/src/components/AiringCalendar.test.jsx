import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { getWeekAiringSchedule } from '../api/anilist';
import AiringCalendar from './AiringCalendar';

vi.mock('../api/anilist', () => ({
  getWeekAiringSchedule: vi.fn(),
}));

function makeSchedule(id, title, popularity, airingAt) {
  return {
    airingAt,
    episode: 3,
    media: {
      id,
      title: { english: title, romaji: null },
      coverImage: { large: 'https://example.com/poster.jpg' },
      popularity,
      episodes: 12,
    },
  };
}

describe('AiringCalendar', () => {
  it('keeps five entries while pinning a currently-watching anime', async () => {
    const release = new Date();
    release.setHours(12, 0, 0, 0);
    const airingAt = Math.floor(release.getTime() / 1000);
    getWeekAiringSchedule.mockResolvedValue([
      makeSchedule(1, 'Popular 1', 100, airingAt),
      makeSchedule(2, 'Popular 2', 200, airingAt),
      makeSchedule(3, 'Popular 3', 300, airingAt),
      makeSchedule(4, 'Popular 4', 400, airingAt),
      makeSchedule(5, 'Popular 5', 500, airingAt),
      makeSchedule(99, 'Quiet Favorite', 1, airingAt),
    ]);

    render(
      <MemoryRouter>
        <AiringCalendar currentlyWatching={[{
          contentType: 'anime',
          contentSource: 'anilist',
          contentId: '99',
          title: 'Quiet Favorite',
        }]} />
      </MemoryRouter>
    );

    expect(await screen.findAllByText('Quiet Favorite')).not.toHaveLength(0);
    expect(screen.getAllByText(/Watching/)).not.toHaveLength(0);
    expect(screen.queryByText('Popular 1')).not.toBeInTheDocument();
  });
});
