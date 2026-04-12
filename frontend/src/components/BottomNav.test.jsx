import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useAuth', () => ({ useAuth: mockUseAuth }));

import BottomNav from './BottomNav';

describe('BottomNav', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all 5 navigation tabs when a user is logged in', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' } });

    render(
      <MemoryRouter initialEntries={['/home']}>
        <BottomNav />
      </MemoryRouter>
    );

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Anime')).toBeInTheDocument();
    expect(screen.getByText('Movies')).toBeInTheDocument();
    expect(screen.getByText('Rooms')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  it('returns null when no user is logged in', () => {
    mockUseAuth.mockReturnValue({ user: null });

    const { container } = render(
      <MemoryRouter initialEntries={['/home']}>
        <BottomNav />
      </MemoryRouter>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('returns null on the watch page', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' } });

    const { container } = render(
      <MemoryRouter initialEntries={['/watch?type=anime&roomId=123']}>
        <BottomNav />
      </MemoryRouter>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('returns null on a manga reader page', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' } });

    const { container } = render(
      <MemoryRouter initialEntries={['/manga/abc-def/chapter/ch-001']}>
        <BottomNav />
      </MemoryRouter>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('applies active styling to the current tab', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' } });

    render(
      <MemoryRouter initialEntries={['/anime']}>
        <BottomNav />
      </MemoryRouter>
    );

    const animeLink = screen.getByText('Anime').closest('a');
    expect(animeLink.className).toContain('text-accent-teal');
  });

  it('does not apply active styling to inactive tabs', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' } });

    render(
      <MemoryRouter initialEntries={['/anime']}>
        <BottomNav />
      </MemoryRouter>
    );

    const homeLink = screen.getByText('Home').closest('a');
    expect(homeLink.className).not.toContain('text-accent-teal');
  });

  it('each tab links to the correct path', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' } });

    render(
      <MemoryRouter initialEntries={['/home']}>
        <BottomNav />
      </MemoryRouter>
    );

    expect(screen.getByText('Home').closest('a')).toHaveAttribute('href', '/home');
    expect(screen.getByText('Anime').closest('a')).toHaveAttribute('href', '/anime');
    expect(screen.getByText('Movies').closest('a')).toHaveAttribute('href', '/movies');
    expect(screen.getByText('Rooms').closest('a')).toHaveAttribute('href', '/rooms');
    expect(screen.getByText('Profile').closest('a')).toHaveAttribute('href', '/profile');
  });

  it('renders the nav as fixed bottom bar', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' } });

    render(
      <MemoryRouter initialEntries={['/home']}>
        <BottomNav />
      </MemoryRouter>
    );

    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('fixed');
    expect(nav.className).toContain('bottom-0');
  });
});
